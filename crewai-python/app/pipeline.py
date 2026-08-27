"""CrewAI feature-delivery pipeline."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Type

from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

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
    "Responde siempre en español. Identificadores de código en inglés cuando sea natural. "
    "Sé concreto y accionable."
)

FRAMEWORK = "crewai"


class _QueryInput(BaseModel):
    query: str = Field(..., description="Search query")


class _PathInput(BaseModel):
    path: str = Field(..., description="Relative path inside the sandbox")


class _WriteInput(BaseModel):
    path: str = Field(..., description="Relative path inside the sandbox")
    content: str = Field(..., description="File contents")


class _PrefixInput(BaseModel):
    prefix: str = Field("", description="Optional subdirectory prefix")


class _ImageInput(BaseModel):
    prompt: str = Field(..., description="Image prompt in English")
    path: str = Field(..., description="Output path e.g. mockup_1.png")


def _make_tools(sandbox: Sandbox) -> list[BaseTool]:
    class SearchKnowledgeTool(BaseTool):
        name: str = "search_knowledge"
        description: str = "Search local engineering knowledge docs"
        args_schema: Type[BaseModel] = _QueryInput

        def _run(self, query: str) -> str:
            return sandbox.search_knowledge(query)

    class WebSearchTool(BaseTool):
        name: str = "web_search"
        description: str = "Search the web via DuckDuckGo (no API key required)"
        args_schema: Type[BaseModel] = _QueryInput

        def _run(self, query: str) -> str:
            return sandbox.web_search(query)

    class WriteFileTool(BaseTool):
        name: str = "write_file"
        description: str = "Write a file inside the run sandbox"
        args_schema: Type[BaseModel] = _WriteInput

        def _run(self, path: str, content: str) -> str:
            return sandbox.write_file(path, content)

    class WriteMermaidTool(BaseTool):
        name: str = "write_mermaid"
        description: str = "Write a Mermaid diagram file under diagrams/"
        args_schema: Type[BaseModel] = _WriteInput

        def _run(self, path: str, content: str) -> str:
            return sandbox.write_mermaid(path, content)

    class GenerateImageTool(BaseTool):
        name: str = "generate_image"
        description: str = "Generate a PNG mockup via OpenAI Images (requires OPENAI_API_KEY)"
        args_schema: Type[BaseModel] = _ImageInput

        def _run(self, prompt: str, path: str) -> str:
            return sandbox.generate_image(prompt, path)

    class ReadFileTool(BaseTool):
        name: str = "read_file"
        description: str = "Read a file from the run sandbox"
        args_schema: Type[BaseModel] = _PathInput

        def _run(self, path: str) -> str:
            return sandbox.read_file(path)

    class ListFilesTool(BaseTool):
        name: str = "list_files"
        description: str = "List files in the run sandbox"
        args_schema: Type[BaseModel] = _PrefixInput

        def _run(self, prefix: str = "") -> str:
            return sandbox.list_files(prefix)

    return [
        SearchKnowledgeTool(),
        WebSearchTool(),
        WriteFileTool(),
        WriteMermaidTool(),
        GenerateImageTool(),
        ReadFileTool(),
        ListFilesTool(),
    ]


def _crew_llm(provider: str | None, model: str | None) -> tuple[LLM, object]:
    settings = resolve_llm_settings(provider, model)
    if settings.provider == "deepseek":
        llm = LLM(
            model=f"openai/{settings.model}",
            api_key=settings.api_key,
            base_url=settings.base_url,
            temperature=0.2,
        )
    else:
        llm = LLM(
            model=f"openai/{settings.model}",
            api_key=settings.api_key,
            temperature=0.2,
        )
    return llm, settings


def _make_agents(llm: LLM, tools: list[BaseTool]) -> dict[str, Agent]:
    return {
        "researcher": Agent(
            role="Researcher",
            goal="Investigar en web y knowledge local; producir research.md",
            backstory=f"Analista que sintetiza fuentes externas e internas. {SPANISH}",
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
        "planner": Agent(
            role="Planner",
            goal="Descomponer la feature en criterios de aceptación y tareas ordenadas",
            backstory=f"Tech lead enfocado en alcance y riesgos. {SPANISH}",
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
        "designer": Agent(
            role="Designer",
            goal="Proponer arquitectura, APIs y modelo de datos",
            backstory=f"Arquitecto de software pragmático. {SPANISH}",
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
        "diagrammer": Agent(
            role="Diagrammer",
            goal="Crear diagramas Mermaid (flowchart) de arquitectura y flujo temporal",
            backstory=(
                f"Especialista en visualización técnica. Solo flowchart/graph "
                f"(nunca sequenceDiagram). {SPANISH}"
            ),
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
        "illustrator": Agent(
            role="Illustrator",
            goal="Generar imágenes o mockups PNG según el pedido",
            backstory=(
                f"Ilustrador que produce assets PNG (imágenes generales o mockups UI). {SPANISH}"
            ),
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
        "coder": Agent(
            role="Coder",
            goal="Implementar la feature en el sandbox usando write_file bajo src/",
            backstory=f"Senior engineer que entrega código claro y mínimo viable. {SPANISH}",
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
        "reviewer": Agent(
            role="Reviewer",
            goal="Revisar plan, diseño y código; emitir veredicto",
            backstory=f"Staff engineer estricto en seguridad y aceptación. {SPANISH}",
            llm=llm,
            tools=tools,
            verbose=True,
            allow_delegation=False,
        ),
    }


def _build_task(
    phase: str,
    request: str,
    agent_map: dict[str, Agent],
    plan: str,
    design: str,
    research: str,
) -> Task:
    if phase == "researcher":
        return Task(
            description=(
                f"Feature request:\n{request}\n\n"
                "Usa web_search y search_knowledge. Escribe research.md con write_file: "
                "fuentes citadas, resumen e implicaciones."
            ),
            expected_output="Contenido de research.md en español",
            agent=agent_map["researcher"],
        )
    if phase == "planner":
        return Task(
            description=(
                f"Feature request:\n{request}\n\nResearch:\n{research}\n\n"
                "Usa search_knowledge si ayuda. Escribe el plan completo en plan.md con write_file. "
                "Incluye criterios de aceptación, tareas, riesgos y fuera de alcance."
            ),
            expected_output="Contenido de plan.md en español",
            agent=agent_map["planner"],
        )
    if phase == "designer":
        return Task(
            description=(
                f"Feature request:\n{request}\n\nPlan existente:\n{plan}\n\n"
                "Produce design.md (write_file) con componentes, endpoints, "
                "modelo de datos y trade-offs. Usa search_knowledge sobre api design si hace falta."
            ),
            expected_output="Contenido de design.md en español",
            agent=agent_map["designer"],
        )
    if phase == "diagrammer":
        return Task(
            description=(
                f"Feature request:\n{request}\n\nPlan:\n{plan}\n\nDesign:\n{design}\n\n"
                "Usa write_mermaid para diagrams/architecture.mmd y diagrams/sequence.mmd. "
                "REGLA: cada archivo debe empezar con 'flowchart TD' o 'flowchart LR' (o 'graph TD'). "
                "NO uses sequenceDiagram ni classDiagram. "
                "sequence.mmd = flujo temporal con flowchart; architecture.mmd = componentes."
            ),
            expected_output="Diagramas Mermaid flowchart bajo diagrams/",
            agent=agent_map["diagrammer"],
        )
    if phase == "illustrator":
        return Task(
            description=(
                f"Request:\n{request}\n\nResearch:\n{research}\n\nDesign:\n{design}\n\n"
                "Usa generate_image para 1-2 imágenes en assets/ (prompts en inglés). "
                "Si hay Design de producto, prioriza mockups UI; si no, genera la imagen "
                "pedida usando Research/Request."
            ),
            expected_output="PNG bajo assets/",
            agent=agent_map["illustrator"],
        )
    if phase == "coder":
        return Task(
            description=(
                f"Feature request:\n{request}\n\nPlan:\n{plan}\n\nDesign:\n{design}\n\n"
                "Implementa la feature. Crea archivos bajo src/ con write_file "
                "(p.ej. src/main.py, src/auth.py, src/README.md). Código funcional mínimo."
            ),
            expected_output="Lista de archivos creados bajo src/",
            agent=agent_map["coder"],
        )
    return Task(
        description=(
            f"Feature request:\n{request}\n\n"
            "Lee plan.md, design.md y el código con read_file/list_files. "
            "Consulta el checklist de review en knowledge. Escribe review.md con hallazgos "
            "y veredicto approve|request_changes|comment."
        ),
        expected_output="Contenido de review.md en español",
        agent=agent_map["reviewer"],
    )


def run_feature_delivery(
    request: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    run_id: str | None = None,
    agents: str | list[str] | None = None,
) -> RunResult:
    selected = parse_agents(agents)
    run_id = run_id or uuid.uuid4().hex[:10]
    output_dir = OUTPUT_DIR / run_id
    sandbox = Sandbox(output_dir, KNOWLEDGE_DIR)
    validate_agent_selection(selected, sandbox)
    tools = _make_tools(sandbox)
    llm, settings = _crew_llm(provider, model)
    agent_map = _make_agents(llm, tools)

    artifacts = load_artifacts(sandbox)
    plan = str(artifacts["plan"])
    design = str(artifacts["design"])
    research = str(artifacts["research"])

    total = len(selected)
    for index, phase in enumerate(selected, start=1):
        ensure_prerequisites(phase, sandbox)
        log_phase_start(phase, index, total, run_id, FRAMEWORK)

        task = _build_task(phase, request, agent_map, plan, design, research)
        crew = Crew(
            agents=[agent_map[phase]],
            tasks=[task],
            process=Process.sequential,
            verbose=True,
        )
        crew.kickoff()

        artifacts = load_artifacts(sandbox)
        plan = str(artifacts["plan"])
        design = str(artifacts["design"])
        research = str(artifacts["research"])

    plan_text = sandbox.read_file("plan.md")
    design_text = sandbox.read_file("design.md")
    review_text = sandbox.read_file("review.md")
    research_text = sandbox.read_file("research.md")
    if plan_text.startswith("ERROR"):
        plan_text = plan
    if design_text.startswith("ERROR"):
        design_text = design
    if review_text.startswith("ERROR"):
        review_text = ""
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
