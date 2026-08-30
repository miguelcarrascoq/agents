"""OpenAI Agents SDK feature-delivery pipeline (sequential agents)."""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from agents import (
    Agent,
    AsyncOpenAI,
    OpenAIChatCompletionsModel,
    Runner,
    function_tool,
    set_tracing_disabled,
)

from app.llm_config import resolve_llm_settings
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

set_tracing_disabled(True)

SPANISH = (
    "Responde siempre en español. Identificadores de código en inglés cuando sea natural."
)

FRAMEWORK = "openai-agents"


def _build_model(provider: str | None, model: str | None):
    settings = resolve_llm_settings(provider, model)
    client = AsyncOpenAI(api_key=settings.api_key, base_url=settings.base_url)
    model_obj = OpenAIChatCompletionsModel(model=settings.model, openai_client=client)
    return model_obj, settings


def run_feature_delivery(
    request: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    run_id: str | None = None,
    agents: str | list[str] | None = None,
) -> RunResult:
    return asyncio.run(
        _run_async(
            request,
            provider=provider,
            model=model,
            run_id=run_id,
            agents=agents,
        )
    )


async def _run_async(
    request: str,
    *,
    provider: str | None,
    model: str | None,
    run_id: str | None,
    agents: str | list[str] | None,
) -> RunResult:
    selected = parse_agents(agents)
    run_id = run_id or uuid.uuid4().hex[:10]
    output_dir = OUTPUT_DIR / run_id
    sandbox = Sandbox(output_dir, KNOWLEDGE_DIR)
    validate_agent_selection(selected, sandbox)
    model_obj, settings = _build_model(provider, model)

    @function_tool
    def search_knowledge(query: str) -> str:
        """Search local engineering knowledge docs."""
        return sandbox.search_knowledge(query)

    @function_tool
    def web_search(query: str) -> str:
        """Search the web via DuckDuckGo (no API key required)."""
        return sandbox.web_search(query)

    @function_tool
    def write_file(path: str, content: str) -> str:
        """Write a file inside the run sandbox."""
        return sandbox.write_file(path, content)

    @function_tool
    def write_mermaid(path: str, content: str) -> str:
        """Write a Mermaid diagram file under diagrams/."""
        return sandbox.write_mermaid(path, content)

    @function_tool
    def generate_image(prompt: str, path: str) -> str:
        """Generate a PNG mockup via OpenAI Images (requires OPENAI_API_KEY)."""
        return sandbox.generate_image(prompt, path)

    @function_tool
    def read_file(path: str) -> str:
        """Read a file from the run sandbox."""
        return sandbox.read_file(path)

    @function_tool
    def list_files(prefix: str = "") -> str:
        """List files in the run sandbox."""
        return sandbox.list_files(prefix)

    tools = [
        search_knowledge,
        web_search,
        write_file,
        write_mermaid,
        generate_image,
        read_file,
        list_files,
    ]

    agent_map = {
        "researcher": Agent(
            name="Researcher",
            instructions=(
                f"{SPANISH} Eres el Researcher. Usa web_search y search_knowledge. "
                "Escribe research.md con fuentes, resumen e implicaciones."
            ),
            model=model_obj,
            tools=tools,
        ),
        "planner": Agent(
            name="Planner",
            instructions=(
                f"{SPANISH} Eres el Planner. Usa search_knowledge si ayuda. "
                "Escribe plan.md con criterios de aceptación y tareas."
            ),
            model=model_obj,
            tools=tools,
        ),
        "designer": Agent(
            name="Designer",
            instructions=(
                f"{SPANISH} Eres el Designer. Escribe design.md (componentes, APIs, datos). "
                "OBLIGATORIO: diagrama de componentes en fence ```mermaid con flowchart TD/LR. "
                "Etiquetas en texto plano (sin HTML ni <br>; sin comillas dobles). "
                "PROHIBIDO: ASCII/textual, sequenceDiagram, classDiagram."
            ),
            model=model_obj,
            tools=tools,
        ),
        "diagrammer": Agent(
            name="Diagrammer",
            instructions=(
                f"{SPANISH} Eres el Diagrammer. Usa write_mermaid para "
                "diagrams/architecture.mmd y diagrams/sequence.mmd. "
                "REGLA: cada archivo debe empezar con 'flowchart TD' o 'flowchart LR' (o 'graph TD'). "
                "NO uses sequenceDiagram ni classDiagram. "
                "sequence.mmd = flujo temporal con flowchart; architecture.mmd = componentes."
            ),
            model=model_obj,
            tools=tools,
        ),
        "illustrator": Agent(
            name="Illustrator",
            instructions=(
                f"{SPANISH} Eres el Illustrator. Usa generate_image para 1-2 imágenes en assets/. "
                "Si hay Design de producto, prioriza mockups UI; si no, genera la imagen pedida."
            ),
            model=model_obj,
            tools=tools,
        ),
        "coder": Agent(
            name="Coder",
            instructions=(
                f"{SPANISH} Eres el Coder. Implementa bajo src/ con write_file."
            ),
            model=model_obj,
            tools=tools,
        ),
        "reviewer": Agent(
            name="Reviewer",
            instructions=(
                f"{SPANISH} Eres el Reviewer. Lee plan.md, design.md y src/. "
                "Escribe review.md con veredicto approve|request_changes|comment."
            ),
            model=model_obj,
            tools=tools,
        ),
    }

    artifacts = load_artifacts(sandbox)
    plan = str(artifacts["plan"])
    design = str(artifacts["design"])
    research = str(artifacts["research"])

    def _prompts() -> dict[str, str]:
        return {
            "researcher": f"Feature request:\n{request}\n\nEscribe research.md completo.",
            "planner": (
                f"Feature request:\n{request}\n\nResearch:\n{research}\n\nEscribe plan.md completo."
            ),
            "designer": f"Feature request:\n{request}\n\nPlan:\n{plan}\n\nEscribe design.md.",
            "diagrammer": (
                f"Feature request:\n{request}\n\nPlan:\n{plan}\n\nDesign:\n{design}\n\n"
                "Crea diagrams/architecture.mmd y diagrams/sequence.mmd con write_mermaid. "
                "Usa solo flowchart TD/LR o graph TD (nunca sequenceDiagram)."
            ),
            "illustrator": (
                f"Request:\n{request}\n\nResearch:\n{research}\n\nDesign:\n{design}\n\n"
                "Usa generate_image para 1-2 imágenes en assets/ (prompts en inglés). "
                "Si hay Design de producto, prioriza mockups UI; si no, genera la imagen "
                "pedida usando Research/Request."
            ),
            "coder": (
                f"Feature request:\n{request}\n\nPlan:\n{plan}\n\nDesign:\n{design}\n\n"
                "Implementa archivos bajo src/."
            ),
            "reviewer": f"Feature request:\n{request}\n\nRevisa artefactos y escribe review.md.",
        }

    total = len(selected)
    for index, phase in enumerate(selected, start=1):
        ensure_prerequisites(phase, sandbox)
        log_phase_start(phase, index, total, run_id, FRAMEWORK)

        artifacts = load_artifacts(sandbox)
        plan = str(artifacts["plan"])
        design = str(artifacts["design"])
        research = str(artifacts["research"])

        await Runner.run(agent_map[phase], _prompts()[phase], max_turns=40)

    def _read(path: str) -> str:
        text = sandbox.read_file(path)
        return "" if text.startswith("ERROR") else text

    artifacts = load_artifacts(sandbox)
    result = RunResult(
        run_id=run_id,
        output_dir=str(output_dir),
        request=request,
        research=_read("research.md"),
        plan=_read("plan.md"),
        design=_read("design.md"),
        review=_read("review.md"),
        files=sandbox.list_written_files(),
        diagrams=list(artifacts["diagrams"]),  # type: ignore[arg-type]
        assets=list(artifacts["assets"]),  # type: ignore[arg-type]
        provider=settings.provider,
        model=settings.model,
    )
    result.write_summary()
    result.announce()
    return result
