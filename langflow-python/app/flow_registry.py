"""Agent → Langflow flow_id registry."""

from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLOW_IDS_PATH = ROOT / "flows" / "flow_ids.json"
FLOW_IDS_EXAMPLE = ROOT / "flows" / "flow_ids.example.json"

AGENTS = (
    "researcher",
    "planner",
    "designer",
    "diagrammer",
    "illustrator",
    "coder",
    "reviewer",
)


def load_flow_ids(path: Path | None = None) -> dict[str, str]:
    """Load agent → flow_id mapping."""
    target = path or FLOW_IDS_PATH
    if not target.exists() and FLOW_IDS_EXAMPLE.exists():
        raise ValueError(
            f"Missing {target.name}. Copy flows/flow_ids.example.json → flows/flow_ids.json "
            "after importing flows (./run.sh bootstrap-flows)."
        )
    if not target.exists():
        raise ValueError(
            f"Missing {target}. Run ./run.sh bootstrap-flows after starting the Langflow server."
        )
    data = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Invalid flow_ids format in {target}")
    missing = [a for a in AGENTS if a not in data or not str(data[a]).strip()]
    if missing:
        raise ValueError(
            f"flow_ids.json missing entries for: {', '.join(missing)}. "
            "Run ./run.sh bootstrap-flows or edit flows/flow_ids.json manually."
        )
    return {k: str(v) for k, v in data.items()}


def save_flow_ids(mapping: dict[str, str], path: Path | None = None) -> Path:
    target = path or FLOW_IDS_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    ordered = {agent: mapping[agent] for agent in AGENTS if agent in mapping}
    target.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def flow_ids_from_env() -> dict[str, str] | None:
    """Optional override: FLOW_ID_RESEARCHER, FLOW_ID_PLANNER, …"""
    mapping: dict[str, str] = {}
    for agent in AGENTS:
        key = f"FLOW_ID_{agent.upper()}"
        val = os.getenv(key, "").strip()
        if val:
            mapping[agent] = val
    return mapping or None
