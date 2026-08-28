"""Langflow feature-delivery pipeline orchestrator (REST API)."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from app.flow_client import LangflowClient
from app.flow_registry import flow_ids_from_env, load_flow_ids
from app.flow_templates import agent_node_id, tool_tweak_ids
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

FRAMEWORK = "langflow"

SPANISH_SYSTEM = (
    "Eres parte de un equipo de ingeniería de software. "
    "Responde siempre en español. Los identificadores de código pueden estar en inglés. "
    "Sé concreto y accionable."
)


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
            header, _body = part.split("=== END FILE ===", 1)
        else:
            header, _body = part, ""
        lines = header.strip().splitlines()
        if not lines:
            continue
        path = lines[0].replace("===", "").strip()
        content = "\n".join(lines[1:]).strip()
        if not path.startswith("src/"):
            path = f"src/{path.lstrip('/')}"
        sandbox.write_file(path, content + "\n")


def _build_phase_input(agent: str, state: dict[str, Any], sandbox: Sandbox) -> str:
    request = state["request"]
    parts = [f"Feature request:\n{request}", f"Run ID (use in all tools): {state['run_id']}"]

    research = state.get("research") or sandbox.read_file("research.md")
    if research.startswith("ERROR"):
        research = ""
    plan = state.get("plan") or sandbox.read_file("plan.md")
    if plan.startswith("ERROR"):
        plan = ""
    design = state.get("design") or sandbox.read_file("design.md")
    if design.startswith("ERROR"):
        design = ""

    if agent == "researcher":
        parts.append("Produce research.md in the sandbox.")
    elif agent == "planner":
        if research:
            parts.append(f"Research:\n{research}")
        parts.append("Produce plan.md in the sandbox.")
    elif agent == "designer":
        parts.append(f"Plan:\n{plan}")
        parts.append("Produce design.md in the sandbox.")
    elif agent == "diagrammer":
        parts.extend([f"Plan:\n{plan}", f"Design:\n{design}"])
        parts.append("Create architecture.mmd and sequence.mmd under diagrams/.")
    elif agent == "illustrator":
        if research:
            parts.append(f"Research:\n{research}")
        parts.append(f"Design:\n{design}")
        parts.append("Generate 1-2 PNG assets under assets/.")
    elif agent == "coder":
        knowledge = sandbox.search_knowledge(request)
        parts.extend([f"Plan:\n{plan}", f"Design:\n{design}", f"Knowledge:\n{knowledge}"])
        revision = state.get("revision_notes") or ""
        if revision:
            parts.append(f"Notas de revisión a corregir:\n{revision}")
        parts.append("Generate implementation under src/.")
    elif agent == "reviewer":
        listing = sandbox.list_files("src")
        file_blobs: list[str] = []
        for rel in state.get("files") or []:
            file_blobs.append(f"----- {rel} -----\n{sandbox.read_file(rel)}")
        checklist = sandbox.search_knowledge("code review checklist seguridad")
        parts.extend(
            [
                f"Plan:\n{plan}",
                f"Design:\n{design}",
                f"Files:\n{listing}",
                f"Code:\n{chr(10).join(file_blobs)}",
                f"Checklist:\n{checklist}",
            ]
        )
        parts.append("Write review.md with verdict approve|request_changes|comment.")

    return "\n\n".join(parts)


def _build_tweaks(
    agent: str,
    run_id: str,
    settings_provider: str,
    settings_model: str,
) -> dict[str, dict[str, Any]]:
    tweaks: dict[str, dict[str, Any]] = {
        agent_node_id(agent): {
            "model_name": settings_model,
            "model": "OpenAI" if settings_provider == "openai" else "OpenAI",
        },
    }
    for _tool_name, node_id in tool_tweak_ids(agent).items():
        tweaks[node_id] = {"run_id": run_id}
    return tweaks


def _apply_phase_result(
    agent: str,
    response: str,
    state: dict[str, Any],
    sandbox: Sandbox,
) -> dict[str, Any]:
    updates: dict[str, Any] = {}

    if agent == "researcher":
        text = sandbox.read_file("research.md")
        if text.startswith("ERROR"):
            sandbox.write_file("research.md", response)
            text = response
        updates["research"] = text

    elif agent == "planner":
        text = sandbox.read_file("plan.md")
        if text.startswith("ERROR"):
            sandbox.write_file("plan.md", response)
            text = response
        updates["plan"] = text

    elif agent == "designer":
        text = sandbox.read_file("design.md")
        if text.startswith("ERROR"):
            sandbox.write_file("design.md", response)
            text = response
        updates["design"] = text

    elif agent == "diagrammer":
        if sandbox.read_file("diagrams/architecture.mmd").startswith("ERROR"):
            arch = _strip_mermaid_fences(response.split("sequence", 1)[0])
            sandbox.write_mermaid("architecture.mmd", arch)
        if sandbox.read_file("diagrams/sequence.mmd").startswith("ERROR"):
            seq_part = response.split("sequence", 1)[-1] if "sequence" in response.lower() else response
            sandbox.write_mermaid("sequence.mmd", _strip_mermaid_fences(seq_part))
        updates["diagrams"] = [
            f for f in sandbox.list_written_files() if f.startswith("diagrams/") and f.endswith(".mmd")
        ]

    elif agent == "illustrator":
        assets = [
            f for f in sandbox.list_written_files() if f.startswith("assets/") and f.endswith(".png")
        ]
        if not assets:
            for index, line in enumerate(response.splitlines(), start=1):
                if not line.strip().upper().startswith("PROMPT"):
                    continue
                prompt = line.split(":", 1)[-1].strip()
                if not prompt:
                    continue
                result = sandbox.generate_image(prompt, f"image_{index}.png")
                if result.startswith("Generated image at "):
                    assets.append(result.replace("Generated image at ", ""))
        updates["assets"] = assets

    elif agent == "coder":
        src_before = set(
            f for f in sandbox.list_written_files() if f.startswith("src/")
        )
        _materialize_files(sandbox, response)
        files = [f for f in sandbox.list_written_files() if f.startswith("src/")]
        if not files or files == list(src_before):
            _materialize_files(sandbox, response)
            files = [f for f in sandbox.list_written_files() if f.startswith("src/")]
        updates["files"] = files
        updates["coder_passes"] = state.get("coder_passes", 0) + 1

    elif agent == "reviewer":
        text = sandbox.read_file("review.md")
        if text.startswith("ERROR"):
            sandbox.write_file("review.md", response)
            text = response
        updates["review"] = text
        notes = ""
        if "request_changes" in text.lower():
            notes = text
        updates["revision_notes"] = notes

    return updates


def run_feature_delivery(
    request: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    run_id: str | None = None,
    agents: str | list[str] | None = None,
) -> RunResult:
    """Public library API — orchestrates Langflow agent flows via REST."""
    selected = parse_agents(agents)
    run_id = run_id or uuid.uuid4().hex[:10]
    output_dir = OUTPUT_DIR / run_id
    sandbox = Sandbox(output_dir, KNOWLEDGE_DIR)
    validate_agent_selection(selected, sandbox)

    settings = resolve_llm_settings(provider, model)
    flow_ids = flow_ids_from_env() or load_flow_ids()
    client = LangflowClient()
    client.require_ready()

    artifacts = load_artifacts(sandbox)
    state: dict[str, Any] = {
        "request": request,
        "run_id": run_id,
        "output_dir": str(output_dir),
        "research": str(artifacts["research"]),
        "plan": str(artifacts["plan"]),
        "design": str(artifacts["design"]),
        "review": str(artifacts["review"]),
        "revision_notes": "",
        "coder_passes": 0,
        "files": list(artifacts["files"]),
        "diagrams": list(artifacts["diagrams"]),
        "assets": list(artifacts["assets"]),
    }

    def run_phase(phase: str, index: int, total: int, label: str | None = None) -> None:
        ensure_prerequisites(phase, sandbox)
        log_phase_start(phase, index, total, run_id, label or FRAMEWORK)
        flow_id = flow_ids[phase]
        input_value = _build_phase_input(phase, state, sandbox)
        tweaks = _build_tweaks(phase, run_id, settings.provider, settings.model)
        response = client.run_flow(
            flow_id,
            input_value,
            tweaks=tweaks,
            session_id=f"{run_id}-{phase}",
        )
        updates = _apply_phase_result(phase, response, state, sandbox)
        state.update(updates)

    total = len(selected)
    for index, phase in enumerate(selected, start=1):
        run_phase(phase, index, total)

        if phase == "reviewer" and "coder" in selected and "reviewer" in selected:
            if (
                state.get("coder_passes", 0) < 2
                and "request_changes" in (state.get("review") or "").lower()
            ):
                run_phase("coder", index, total, f"{FRAMEWORK} (revision loop)")
                run_phase("reviewer", index, total, f"{FRAMEWORK} (re-review)")

    result = RunResult(
        run_id=run_id,
        output_dir=str(output_dir),
        request=request,
        research=state.get("research", ""),
        plan=state.get("plan", ""),
        design=state.get("design", ""),
        review=state.get("review", ""),
        files=state.get("files") or [f for f in sandbox.list_written_files() if f.startswith("src/")],
        diagrams=state.get("diagrams") or [],
        assets=state.get("assets") or [],
        provider=settings.provider,
        model=settings.model,
    )
    result.write_summary()
    result.announce()
    return result
