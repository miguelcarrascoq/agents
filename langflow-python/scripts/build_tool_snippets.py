#!/usr/bin/env python3
"""Build flow node snippets for custom sandbox tools (requires running Langflow)."""

from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = ROOT / "flows" / "_simple_agent_template.json"
OUT_PATH = ROOT / "flows" / "_generate_image_tool_snippet.json"
NODE_ID = "GenerateImageTool-Sbx01"
AGENT_NODE_ID = "Agent-EXpSZ"
REFERENCE_NODE_ID = "UnifiedWebSearch-KZ8k6"


def _serialize_handle(obj: dict, *, compact: bool) -> str:
    separators = (",", ":") if compact else (", ", ": ")
    encoded = json.dumps(obj, separators=separators)
    return encoded.replace('"', "\u0153")


def _make_tool_to_agent_edge(tool_id: str, tool_type: str) -> dict:
    source_handle = {
        "dataType": tool_type,
        "id": tool_id,
        "name": "component_as_tool",
        "output_types": ["Tool"],
    }
    target_handle = {
        "fieldName": "tools",
        "id": AGENT_NODE_ID,
        "inputTypes": ["Tool"],
        "type": "other",
    }
    return {
        "animated": False,
        "className": "",
        "data": {
            "sourceHandle": source_handle,
            "targetHandle": target_handle,
        },
        "id": (
            f"reactflow__edge-{tool_id}"
            f"{_serialize_handle(source_handle, compact=True)}"
            f"-{AGENT_NODE_ID}"
            f"{_serialize_handle(target_handle, compact=True)}"
        ),
        "selected": False,
        "source": tool_id,
        "sourceHandle": _serialize_handle(source_handle, compact=False),
        "target": AGENT_NODE_ID,
        "targetHandle": _serialize_handle(target_handle, compact=False),
    }


def _find_component(all_data: dict, name: str) -> dict:
    def walk(obj: object) -> dict | None:
        if isinstance(obj, dict):
            if name in obj:
                return obj[name]
            for value in obj.values():
                found = walk(value)
                if found:
                    return found
        elif isinstance(obj, list):
            for value in obj:
                found = walk(value)
                if found:
                    return found
        return None

    found = walk(all_data)
    if not found:
        raise RuntimeError(f"{name} not found in /api/v1/all")
    return found


def build_generate_image_snippet(*, run_id: str = "playground") -> dict:
    load_dotenv(ROOT / ".env")
    base = (os.getenv("LANGFLOW_URL") or "http://localhost:7860").rstrip("/")
    api_key = (os.getenv("LANGFLOW_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("LANGFLOW_API_KEY is required")

    template = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    web_node = next(n for n in template["data"]["nodes"] if n["id"] == REFERENCE_NODE_ID)

    resp = requests.get(
        f"{base}/api/v1/all",
        headers={"x-api-key": api_key, "accept": "application/json"},
        timeout=120,
    )
    resp.raise_for_status()
    component = _find_component(resp.json(), "GenerateImageTool")

    inner = copy.deepcopy(component)
    inner["template"]["run_id"]["value"] = run_id
    inner["template"]["path"]["value"] = "assets/image_1.png"

    node = copy.deepcopy(web_node)
    node["id"] = NODE_ID
    node["data"]["id"] = NODE_ID
    node["data"]["type"] = "GenerateImageTool"
    node["data"]["node"] = inner
    node["position"] = {"x": 900, "y": 200}

    edge = _make_tool_to_agent_edge(NODE_ID, "GenerateImageTool")

    return {"node": node, "edge": edge, "node_id": NODE_ID}


def main() -> None:
    snippet = build_generate_image_snippet()
    OUT_PATH.write_text(json.dumps(snippet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
