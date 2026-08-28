#!/usr/bin/env python3
"""Upload agent flows to Langflow and write flows/flow_ids.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.flow_client import LangflowClient  # noqa: E402
from app.flow_registry import AGENTS, save_flow_ids  # noqa: E402
from app.flow_templates import write_flow_files  # noqa: E402


def main() -> int:
    write_flow_files()
    client = LangflowClient()
    client.require_ready()

    mapping: dict[str, str] = {}
    flows_dir = ROOT / "flows"

    for agent in AGENTS:
        path = flows_dir / f"{agent}.json"
        if not path.exists():
            print(f"Missing flow template: {path}", file=sys.stderr)
            return 1
        flow_data = json.loads(path.read_text(encoding="utf-8"))
        try:
            flow_id = client.upload_flow(flow_data, replace=True)
        except RuntimeError as exc:
            print(f"Failed on {agent}: {exc}", file=sys.stderr)
            return 1
        mapping[agent] = flow_id
        print(f"  {agent}: {flow_id}")

    out = save_flow_ids(mapping)
    print(f"\nWrote {out}")
    print("Open Langflow UI to inspect/edit flows: http://localhost:7860")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
