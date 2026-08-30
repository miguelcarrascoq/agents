"""Pipeline phase logging and agent selection helpers."""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.tools import Sandbox

PHASES = (
    "researcher",
    "planner",
    "designer",
    "diagrammer",
    "illustrator",
    "coder",
    "reviewer",
)

DEFAULT_PHASES = ("planner", "designer", "coder", "reviewer")

PREREQUISITES: dict[str, tuple[str, ...]] = {
    "researcher": (),
    "planner": (),
    "designer": ("plan.md",),
    "diagrammer": ("plan.md", "design.md"),
    "illustrator": (),
    "coder": ("plan.md", "design.md"),
    "reviewer": ("plan.md", "design.md"),
}

ARTIFACT_PRODUCERS: dict[str, str] = {
    "plan.md": "planner",
    "design.md": "designer",
    "research.md": "researcher",
}


def parse_agents(value: str | list[str] | None) -> list[str]:
    """Parse --agents flag or programmatic list into canonical order."""
    if value is None:
        return list(DEFAULT_PHASES)
    if isinstance(value, str):
        raw = [a.strip().lower() for a in value.replace(",", " ").split() if a.strip()]
    else:
        raw = [a.strip().lower() for a in value if a.strip()]
    if not raw:
        return list(DEFAULT_PHASES)
    unknown = set(raw) - set(PHASES)
    if unknown:
        raise ValueError(
            f"Unknown agent(s): {', '.join(sorted(unknown))}. "
            f"Valid: {', '.join(PHASES)}"
        )
    return [p for p in PHASES if p in raw]


def _read_artifact(sandbox: Sandbox, path: str) -> str:
    text = sandbox.read_file(path)
    if text.startswith("ERROR"):
        return ""
    return text


def load_artifacts(sandbox: Sandbox) -> dict[str, str | list[str]]:
    """Load existing artifacts from the sandbox."""
    plan = _read_artifact(sandbox, "plan.md")
    design = _read_artifact(sandbox, "design.md")
    review = _read_artifact(sandbox, "review.md")
    research = _read_artifact(sandbox, "research.md")
    files = [f for f in sandbox.list_written_files() if f.startswith("src/")]
    diagrams = [
        f for f in sandbox.list_written_files() if f.startswith("diagrams/") and f.endswith(".mmd")
    ]
    assets = [
        f for f in sandbox.list_written_files() if f.startswith("assets/") and f.endswith(".png")
    ]
    return {
        "plan": plan,
        "design": design,
        "review": review,
        "research": research,
        "files": files,
        "diagrams": diagrams,
        "assets": assets,
    }


def ensure_prerequisites(phase: str, sandbox: Sandbox) -> None:
    """Raise ValueError if required artifacts are missing for a phase."""
    missing: list[str] = []
    for artifact in PREREQUISITES.get(phase, ()):
        text = sandbox.read_file(artifact)
        if text.startswith("ERROR"):
            missing.append(artifact)
    if phase == "reviewer":
        src_files = [f for f in sandbox.list_written_files() if f.startswith("src/")]
        if not src_files:
            missing.append("src/**")
    if missing:
        raise ValueError(
            f"Cannot run '{phase}': missing prerequisite(s): {', '.join(missing)}. "
            f"Run earlier phase(s) first or reuse --run-id with existing artifacts."
        )


def validate_agent_selection(selected: list[str], sandbox: Sandbox) -> None:
    """Fail fast when selected agents cannot satisfy prerequisites."""
    errors: list[str] = []
    for phase in selected:
        for artifact in PREREQUISITES.get(phase, ()):
            if not sandbox.read_file(artifact).startswith("ERROR"):
                continue
            producer = ARTIFACT_PRODUCERS.get(artifact)
            if producer and producer in selected and selected.index(producer) < selected.index(phase):
                continue
            if producer:
                errors.append(
                    f"'{phase}' needs {artifact} — add '{producer}' before it in --agents, "
                    f"or pass --run-id with existing artifacts"
                )
            else:
                errors.append(f"'{phase}' needs {artifact}")
        if phase == "reviewer":
            src_files = [f for f in sandbox.list_written_files() if f.startswith("src/")]
            if not src_files and not (
                "coder" in selected and selected.index("coder") < selected.index("reviewer")
            ):
                errors.append(
                    "'reviewer' needs src/** — add 'coder' before it in --agents, "
                    "or pass --run-id with existing code"
                )
    if errors:
        raise ValueError("Invalid agent selection:\n- " + "\n- ".join(errors))


def log_phase_start(
    phase: str,
    index: int,
    total: int,
    run_id: str,
    framework: str,
) -> None:
    """Print a pipeline-level banner to stderr before each agent phase."""
    banner = (
        f"\n{'═' * 40}\n"
        f"Pipeline {index}/{total} · {phase}\n"
        f"(run_id={run_id} · {framework})\n"
        f"{'═' * 40}\n"
    )
    sys.stderr.write(banner)
    sys.stderr.flush()
    try:
        from feature_delivery_api.progress import emit_phase
    except ImportError:
        return
    emit_phase(phase, index, total, run_id, framework)
