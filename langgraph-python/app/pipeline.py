"""LangGraph feature-delivery pipeline."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from app.llm_config import build_chat_openai, resolve_llm_settings
from app.models import RunResult
from app.phase_log import (
    ensure_prerequisites,
    load_artifacts,
    log_phase_start,
    parse_agents,
    validate_agent_selection,
)
from app.tools import Sandbox

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = ROOT / "knowledge"
OUTPUT_DIR = ROOT / "output"

SPANISH_SYSTEM = (
    "Eres parte de un equipo de ingeniería de software. "
    "Responde siempre en español. Los identificadores de código pueden estar en inglés. "
    "Sé concreto y accionable."
)

FRAMEWORK = "langgraph"


class GraphState(TypedDict):
    request: str
    run_id: str
    output_dir: str
    research: str
    plan: str
    design: str
    review: str
    revision_notes: str
    coder_passes: int
    files: list[str]
    diagrams: list[str]
    assets: list[str]


def _llm(provider: str | None, model: str | None):
    settings = resolve_llm_settings(provider, model)
    return build_chat_openai(settings), settings


def _call(llm, system: str, user: str) -> str:
    msg = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    return str(msg.content)


def _strip_mermaid_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:mermaid)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _materialize_files(sandbox: Sandbox, bundle: str) -> None:
    parts = bundle.split("=== FILE:")
    for part in parts[1:]:
        if "=== END FILE ===" in part:
            header, body = part.split("=== END FILE ===", 1)
        else:
            header, body = part, ""
        lines = header.strip().splitlines()
        if not lines:
            continue
        path = lines[0].replace("===", "").strip()
        content = "\n".join(lines[1:]).strip()
        if not path.startswith("src/"):
            path = f"src/{path.lstrip('/')}"
        sandbox.write_file(path, content + "\n")


def build_node_handlers(sandbox: Sandbox, provider: str | None = None, model: str | None = None):
    llm, settings = _llm(provider, model)

    def researcher(state: GraphState) -> dict:
        web = sandbox.web_search(state["request"])
        knowledge = sandbox.search_knowledge(state["request"])
        research = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Researcher. Sintetiza hallazgos web y knowledge local en research.md: "
            "fuentes citadas, resumen ejecutivo e implicaciones para la feature.",
            f"Feature request:\n{state['request']}\n\nWeb:\n{web}\n\nKnowledge:\n{knowledge}",
        )
        sandbox.write_file("research.md", research)
        return {"research": research}

    def planner(state: GraphState) -> dict:
        knowledge = sandbox.search_knowledge(state["request"])
        research = state.get("research") or sandbox.read_file("research.md")
        if research.startswith("ERROR"):
            research = ""
        plan = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Planner. Produce un plan de entrega en markdown con: "
            "contexto, criterios de aceptación, tareas ordenadas, riesgos y fuera de alcance.",
            f"Feature request:\n{state['request']}\n\nResearch:\n{research}\n\nKnowledge:\n{knowledge}",
        )
        sandbox.write_file("plan.md", plan)
        return {"plan": plan}

    def designer(state: GraphState) -> dict:
        knowledge = sandbox.search_knowledge(state["request"] + " api design")
        design = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Designer/Architect. Produce design.md en markdown con: "
            "componentes, APIs (endpoints), modelo de datos, trade-offs y un diagrama de "
            "componentes. OBLIGATORIO: el diagrama debe ir en un fence ```mermaid con "
            "flowchart TD o flowchart LR. Etiquetas de nodos en texto plano corto "
            "(sin HTML ni <br>; sin comillas dobles en etiquetas). PROHIBIDO: diagramas "
            "ASCII/textual, sequenceDiagram, classDiagram.",
            f"Request:\n{state['request']}\n\nPlan:\n{state['plan']}\n\nKnowledge:\n{knowledge}",
        )
        sandbox.write_file("design.md", design)
        return {"design": design}

    def diagrammer(state: GraphState) -> dict:
        arch = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Diagrammer. Genera SOLO código Mermaid válido para un diagrama de arquitectura "
            "(debe empezar con flowchart TD, flowchart LR o graph TD). Sin markdown ni explicaciones.",
            f"Request:\n{state['request']}\n\nPlan:\n{state['plan']}\n\nDesign:\n{state['design']}",
        )
        sandbox.write_mermaid("architecture.mmd", _strip_mermaid_fences(arch))
        seq = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Diagrammer. Genera SOLO código Mermaid válido para un flujo temporal "
            "(pasos / secuencia de interacción) usando 'flowchart LR' o 'flowchart TD'. "
            "NO uses sequenceDiagram ni classDiagram. Sin markdown ni explicaciones.",
            f"Request:\n{state['request']}\n\nPlan:\n{state['plan']}\n\nDesign:\n{state['design']}",
        )
        sandbox.write_mermaid("sequence.mmd", _strip_mermaid_fences(seq))
        diagrams = [
            f for f in sandbox.list_written_files() if f.startswith("diagrams/") and f.endswith(".mmd")
        ]
        return {"diagrams": diagrams}

    def illustrator(state: GraphState) -> dict:
        research = state.get("research") or sandbox.read_file("research.md")
        if research.startswith("ERROR"):
            research = ""
        prompts_text = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Illustrator. Propón exactamente 1-2 prompts en inglés para imágenes. "
            "Si hay Design de producto, prioriza mockups UI; si no, genera la imagen pedida "
            "usando Research/Request. Responde SOLO con líneas: PROMPT1: ... y PROMPT2: ...",
            f"Request:\n{state['request']}\n\nResearch:\n{research}\n\nDesign:\n{state['design']}",
        )
        assets: list[str] = []
        for index, line in enumerate(prompts_text.splitlines(), start=1):
            if not line.strip().upper().startswith("PROMPT"):
                continue
            prompt = line.split(":", 1)[-1].strip()
            if not prompt:
                continue
            result = sandbox.generate_image(prompt, f"image_{index}.png")
            if result.startswith("Generated image at "):
                assets.append(result.replace("Generated image at ", ""))
        return {"assets": assets}

    def coder(state: GraphState) -> dict:
        knowledge = sandbox.search_knowledge(state["request"])
        revision = state.get("revision_notes") or ""
        prompt = (
            f"Request:\n{state['request']}\n\nPlan:\n{state['plan']}\n\n"
            f"Design:\n{state['design']}\n\nKnowledge:\n{knowledge}\n"
        )
        if revision:
            prompt += f"\nNotas de revisión a corregir:\n{revision}\n"

        code_bundle = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Coder. Genera una implementación mínima pero realista. "
            "Responde SOLO con bloques así:\n"
            "=== FILE: src/ruta/archivo.ext ===\n"
            "...contenido...\n"
            "=== END FILE ===\n"
            "Puedes emitir varios archivos. Incluye README breve en src/README.md si ayuda.",
            prompt,
        )
        _materialize_files(sandbox, code_bundle)
        files = [f for f in sandbox.list_written_files() if f.startswith("src/")]
        return {"files": files, "coder_passes": state.get("coder_passes", 0) + 1}

    def reviewer(state: GraphState) -> dict:
        listing = sandbox.list_files("src")
        file_blobs: list[str] = []
        for rel in state.get("files") or []:
            file_blobs.append(f"----- {rel} -----\n{sandbox.read_file(rel)}")
        checklist = sandbox.search_knowledge("code review checklist seguridad")
        review = _call(
            llm,
            SPANISH_SYSTEM
            + " Eres el Reviewer. Escribe review.md en markdown con: hallazgos "
            "(severity/media/baja), gaps vs criterios de aceptación, y veredicto "
            "`approve` | `request_changes` | `comment`. "
            "Si el veredicto es request_changes, incluye una sección "
            "## Notas para el coder con cambios concretos.",
            (
                f"Request:\n{state['request']}\n\nPlan:\n{state['plan']}\n\n"
                f"Design:\n{state['design']}\n\nFiles:\n{listing}\n\n"
                f"Code:\n{chr(10).join(file_blobs)}\n\nChecklist:\n{checklist}"
            ),
        )
        sandbox.write_file("review.md", review)
        notes = ""
        if "request_changes" in review.lower():
            notes = review
        return {"review": review, "revision_notes": notes}

    nodes = {
        "researcher": researcher,
        "planner": planner,
        "designer": designer,
        "diagrammer": diagrammer,
        "illustrator": illustrator,
        "coder": coder,
        "reviewer": reviewer,
    }
    return nodes, settings


def build_graph(sandbox: Sandbox, provider: str | None = None, model: str | None = None):
    nodes, settings = build_node_handlers(sandbox, provider=provider, model=model)

    def route_after_review(state: GraphState) -> Literal["coder", "end"]:
        if state.get("coder_passes", 0) >= 2:
            return "end"
        if "request_changes" in (state.get("review") or "").lower():
            return "coder"
        return "end"

    graph = StateGraph(GraphState)
    for name, handler in nodes.items():
        graph.add_node(name, handler)
    graph.add_edge(START, "researcher")
    graph.add_edge("researcher", "planner")
    graph.add_edge("planner", "designer")
    graph.add_edge("designer", "diagrammer")
    graph.add_edge("diagrammer", "illustrator")
    graph.add_edge("illustrator", "coder")
    graph.add_edge("coder", "reviewer")
    graph.add_conditional_edges(
        "reviewer",
        route_after_review,
        {"coder": "coder", "end": END},
    )
    compiled = graph.compile()
    return compiled, settings, nodes


def run_feature_delivery(
    request: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    run_id: str | None = None,
    agents: str | list[str] | None = None,
) -> RunResult:
    """Public library API — safe to wrap with HTTP later."""
    selected = parse_agents(agents)
    run_id = run_id or uuid.uuid4().hex[:10]
    output_dir = OUTPUT_DIR / run_id
    sandbox = Sandbox(output_dir, KNOWLEDGE_DIR)
    validate_agent_selection(selected, sandbox)
    _, settings, nodes = build_graph(sandbox, provider=provider, model=model)

    artifacts = load_artifacts(sandbox)
    state: GraphState = {
        "request": request,
        "run_id": run_id,
        "output_dir": str(output_dir),
        "research": str(artifacts["research"]),
        "plan": str(artifacts["plan"]),
        "design": str(artifacts["design"]),
        "review": str(artifacts["review"]),
        "revision_notes": "",
        "coder_passes": 0,
        "files": list(artifacts["files"]),  # type: ignore[arg-type]
        "diagrams": list(artifacts["diagrams"]),  # type: ignore[arg-type]
        "assets": list(artifacts["assets"]),  # type: ignore[arg-type]
    }

    total = len(selected)
    for index, phase in enumerate(selected, start=1):
        ensure_prerequisites(phase, sandbox)
        log_phase_start(phase, index, total, run_id, FRAMEWORK)
        updates = nodes[phase](state)
        state.update(updates)

        if phase == "reviewer" and "coder" in selected and "reviewer" in selected:
            if (
                state.get("coder_passes", 0) < 2
                and "request_changes" in (state.get("review") or "").lower()
            ):
                ensure_prerequisites("coder", sandbox)
                log_phase_start("coder", index, total, run_id, f"{FRAMEWORK} (revision loop)")
                updates = nodes["coder"](state)
                state.update(updates)
                log_phase_start("reviewer", index, total, run_id, f"{FRAMEWORK} (re-review)")
                updates = nodes["reviewer"](state)
                state.update(updates)

    result = RunResult(
        run_id=run_id,
        output_dir=str(output_dir),
        request=request,
        research=state.get("research", ""),
        plan=state.get("plan", ""),
        design=state.get("design", ""),
        review=state.get("review", ""),
        files=state.get("files") or sandbox.list_written_files(),
        diagrams=state.get("diagrams") or [],
        assets=state.get("assets") or [],
        provider=settings.provider,
        model=settings.model,
    )
    result.write_summary()
    result.announce()
    return result
