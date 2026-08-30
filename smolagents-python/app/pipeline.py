"""smolagents feature-delivery pipeline."""

from __future__ import annotations

import uuid
from pathlib import Path

from smolagents import LiteLLMModel, LogLevel, Tool, ToolCallingAgent

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

SPANISH = (
    "Responde siempre en español. Identificadores de código en inglés cuando sea natural."
)

FRAMEWORK = "smolagents"


def _tools_for(sandbox: Sandbox) -> list[Tool]:
    class SearchKnowledge(Tool):
        name = "search_knowledge"
        description = "Search local engineering knowledge docs"
        inputs = {"query": {"type": "string", "description": "Search query"}}
        output_type = "string"

        def forward(self, query: str) -> str:
            return sandbox.search_knowledge(query)

    class WebSearch(Tool):
        name = "web_search"
        description = "Search the web via DuckDuckGo (no API key required)"
        inputs = {"query": {"type": "string", "description": "Search query"}}
        output_type = "string"

        def forward(self, query: str) -> str:
            return sandbox.web_search(query)

    class WriteFile(Tool):
        name = "write_file"
        description = "Write a file inside the run sandbox"
        inputs = {
            "path": {"type": "string", "description": "Relative path"},
            "content": {"type": "string", "description": "File contents"},
        }
        output_type = "string"

        def forward(self, path: str, content: str) -> str:
            return sandbox.write_file(path, content)

    class WriteMermaid(Tool):
        name = "write_mermaid"
        description = "Write a Mermaid diagram file under diagrams/"
        inputs = {
            "path": {"type": "string", "description": "Filename e.g. architecture.mmd"},
            "content": {"type": "string", "description": "Mermaid source code"},
        }
        output_type = "string"

        def forward(self, path: str, content: str) -> str:
            return sandbox.write_mermaid(path, content)

    class GenerateImage(Tool):
        name = "generate_image"
        description = "Generate a PNG mockup via OpenAI Images (requires OPENAI_API_KEY)"
        inputs = {
            "prompt": {"type": "string", "description": "Image prompt in English"},
            "path": {"type": "string", "description": "Output path e.g. mockup_1.png"},
        }
        output_type = "string"

        def forward(self, prompt: str, path: str) -> str:
            return sandbox.generate_image(prompt, path)

    class ReadFile(Tool):
        name = "read_file"
        description = "Read a file from the run sandbox"
        inputs = {"path": {"type": "string", "description": "Relative path"}}
        output_type = "string"

        def forward(self, path: str) -> str:
            return sandbox.read_file(path)

    class ListFiles(Tool):
        name = "list_files"
        description = "List files in the run sandbox"
        inputs = {
            "prefix": {
                "type": "string",
                "description": "Optional subdirectory",
                "nullable": True,
            }
        }
        output_type = "string"

        def forward(self, prefix: str = "") -> str:
            return sandbox.list_files(prefix or "")

    return [
        SearchKnowledge(),
        WebSearch(),
        WriteFile(),
        WriteMermaid(),
        GenerateImage(),
        ReadFile(),
        ListFiles(),
    ]


def _model(provider: str | None, model: str | None):
    settings = resolve_llm_settings(provider, model)
    if settings.provider == "deepseek":
        litellm_id = f"openai/{settings.model}"
        return (
            LiteLLMModel(
                model_id=litellm_id,
                api_key=settings.api_key,
                api_base=settings.base_url,
            ),
            settings,
        )
    return (
        LiteLLMModel(model_id=f"openai/{settings.model}", api_key=settings.api_key),
        settings,
    )


def _make_agents(
    tools: list[Tool],
    llm: LiteLLMModel,
    verbosity_level: LogLevel,
) -> dict[str, ToolCallingAgent]:
    return {
        "researcher": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="researcher",
            description="Investiga en web y knowledge local",
            verbosity_level=verbosity_level,
        ),
        "planner": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="planner",
            description="Planifica features de software",
            verbosity_level=verbosity_level,
        ),
        "designer": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="designer",
            description="Diseña arquitectura y APIs",
            verbosity_level=verbosity_level,
        ),
        "diagrammer": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="diagrammer",
            description="Genera diagramas Mermaid",
            verbosity_level=verbosity_level,
        ),
        "illustrator": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="illustrator",
            description="Genera imágenes o mockups visuales",
            verbosity_level=verbosity_level,
        ),
        "coder": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="coder",
            description="Implementa código en el sandbox",
            verbosity_level=verbosity_level,
        ),
        "reviewer": ToolCallingAgent(
            tools=tools,
            model=llm,
            name="reviewer",
            description="Revisa el entregable",
            verbosity_level=verbosity_level,
        ),
    }


def _phase_prompts(request: str, plan: str, design: str, research: str) -> dict[str, str]:
    return {
        "researcher": (
            f"{SPANISH}\nEres el Researcher.\nFeature: {request}\n"
            "Usa web_search y search_knowledge. Escribe research.md con write_file: "
            "fuentes, resumen e implicaciones."
        ),
        "planner": (
            f"{SPANISH}\nEres el Planner.\nFeature: {request}\n"
            f"Research:\n{research}\n"
            "Usa search_knowledge si ayuda. Escribe el plan en plan.md con write_file."
        ),
        "designer": (
            f"{SPANISH}\nEres el Designer.\nFeature: {request}\nPlan:\n{plan}\n"
            "Escribe design.md con write_file (componentes, APIs, datos, trade-offs). "
            "OBLIGATORIO: diagrama en fence ```mermaid con flowchart TD/LR. "
            "Etiquetas en texto plano (sin HTML ni <br>). "
            "PROHIBIDO: ASCII/textual, sequenceDiagram, classDiagram."
        ),
        "diagrammer": (
            f"{SPANISH}\nEres el Diagrammer.\nFeature: {request}\nPlan:\n{plan}\nDesign:\n{design}\n"
            "Usa write_mermaid para diagrams/architecture.mmd y diagrams/sequence.mmd.\n"
            "REGLA: cada archivo debe empezar con 'flowchart TD' o 'flowchart LR' (o 'graph TD'). "
            "NO uses sequenceDiagram, classDiagram ni pie — el preview de Cursor no los soporta. "
            "sequence.mmd = flujo temporal de pasos con flowchart; architecture.mmd = componentes."
        ),
        "illustrator": (
            f"{SPANISH}\nEres el Illustrator.\nRequest: {request}\n"
            f"Research:\n{research}\nDesign:\n{design}\n"
            "Usa generate_image para 1-2 imágenes en assets/ (prompts en inglés). "
            "Si hay Design de producto, prioriza mockups UI; si no, genera la imagen "
            "pedida usando Research/Request."
        ),
        "coder": (
            f"{SPANISH}\nEres el Coder.\nFeature: {request}\nPlan:\n{plan}\nDesign:\n{design}\n"
            "Implementa archivos bajo src/ usando write_file. Código mínimo viable."
        ),
        "reviewer": (
            f"{SPANISH}\nEres el Reviewer.\nFeature: {request}\n"
            "Lee plan.md, design.md y src/ con tus tools. Escribe review.md con hallazgos "
            "y veredicto approve|request_changes|comment. Usa search_knowledge para el checklist."
        ),
    }


def run_feature_delivery(
    request: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    run_id: str | None = None,
    agents: str | list[str] | None = None,
    quiet: bool = False,
) -> RunResult:
    selected = parse_agents(agents)
    run_id = run_id or uuid.uuid4().hex[:10]
    output_dir = OUTPUT_DIR / run_id
    sandbox = Sandbox(output_dir, KNOWLEDGE_DIR)
    validate_agent_selection(selected, sandbox)
    tools = _tools_for(sandbox)
    llm, settings = _model(provider, model)
    verbosity = LogLevel.ERROR if quiet else LogLevel.INFO
    agent_map = _make_agents(tools, llm, verbosity)

    artifacts = load_artifacts(sandbox)
    plan = str(artifacts["plan"])
    design = str(artifacts["design"])
    review = str(artifacts["review"])
    research = str(artifacts["research"])

    total = len(selected)
    for index, phase in enumerate(selected, start=1):
        ensure_prerequisites(phase, sandbox)
        log_phase_start(phase, index, total, run_id, FRAMEWORK)

        prompts = _phase_prompts(request, plan, design, research)
        agent_map[phase].run(prompts[phase])
        artifacts = load_artifacts(sandbox)
        plan = str(artifacts["plan"]) or plan
        design = str(artifacts["design"]) or design
        review = str(artifacts["review"]) or review
        research = str(artifacts["research"]) or research

    plan_text = sandbox.read_file("plan.md")
    design_text = sandbox.read_file("design.md")
    review_text = sandbox.read_file("review.md")
    research_text = sandbox.read_file("research.md")
    if plan_text.startswith("ERROR"):
        plan_text = plan
    if design_text.startswith("ERROR"):
        design_text = design
    if review_text.startswith("ERROR"):
        review_text = review
    if research_text.startswith("ERROR"):
        research_text = research

    result = RunResult(
        run_id=run_id,
        output_dir=str(output_dir),
        request=request,
        research=research_text,
        plan=plan_text,
        design=design_text,
        review=review_text,
        files=sandbox.list_written_files(),
        diagrams=list(artifacts["diagrams"]),  # type: ignore[arg-type]
        assets=list(artifacts["assets"]),  # type: ignore[arg-type]
        provider=settings.provider,
        model=settings.model,
    )
    result.write_summary()
    result.announce()
    return result
