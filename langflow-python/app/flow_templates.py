"""Build UI-compatible Langflow agent flows from the Simple Agent template."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

SPANISH_BASE = (
    "Eres parte de un equipo de ingeniería de software. "
    "Responde siempre en español. Los identificadores de código pueden estar en inglés. "
    "Sé concreto y accionable."
)

AGENT_NODE_ID = "Agent-EXpSZ"
RESEARCHER_WEB_SEARCH_ID = "UnifiedWebSearch-KZ8k6"
GENERATE_IMAGE_TOOL_ID = "GenerateImageTool-Sbx01"
REMOVE_NODE_IDS = {"URLComponent-Tjh8k", "note-5r6R8"}
GENERATE_IMAGE_SNIPPET_PATH = (
    Path(__file__).resolve().parent.parent / "flows" / "_generate_image_tool_snippet.json"
)

AGENT_CONFIGS: dict[str, dict[str, Any]] = {
    "researcher": {
        "display_name": "Feature Delivery — Researcher",
        "description": "Web + knowledge research for a feature request.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Researcher. Usa la herramienta de web search cuando ayude. "
            "Produce research.md con fuentes citadas, resumen ejecutivo e implicaciones."
        ),
        "include_web_search": True,
    },
    "planner": {
        "display_name": "Feature Delivery — Planner",
        "description": "Produce plan.md from feature context.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Planner. Produce plan.md en markdown con: "
            "contexto, criterios de aceptación, tareas ordenadas, riesgos y fuera de alcance."
        ),
        "include_web_search": False,
    },
    "designer": {
        "display_name": "Feature Delivery — Designer",
        "description": "Produce design.md from plan and knowledge.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Designer/Architect. Produce design.md en markdown con: "
            "componentes, APIs (endpoints), modelo de datos, trade-offs y diagrama textual."
        ),
        "include_web_search": False,
    },
    "diagrammer": {
        "display_name": "Feature Delivery — Diagrammer",
        "description": "Create Mermaid architecture and sequence diagrams.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Diagrammer. Genera dos diagramas Mermaid válidos: "
            "1) arquitectura (flowchart TD/LR) 2) secuencia (flowchart LR/TD, NO sequenceDiagram)."
        ),
        "include_web_search": False,
    },
    "illustrator": {
        "display_name": "Feature Delivery — Illustrator",
        "description": "Generate PNG assets from prompts.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Illustrator. Usa la herramienta generate_image para crear 1-2 PNG "
            "bajo assets/ (prompt en inglés, paths como assets/image_1.png). "
            "Tras generar, confirma en español las rutas exactas de los archivos."
        ),
        "include_web_search": False,
        "include_generate_image": True,
    },
    "coder": {
        "display_name": "Feature Delivery — Coder",
        "description": "Generate src/** implementation files.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Coder. Genera una implementación mínima pero realista. "
            "Responde SOLO con bloques === FILE: src/ruta/archivo.ext === ... === END FILE ===."
        ),
        "include_web_search": False,
    },
    "reviewer": {
        "display_name": "Feature Delivery — Reviewer",
        "description": "Review code and write review.md.",
        "system_prompt": (
            SPANISH_BASE
            + " Eres el Reviewer. Escribe review.md con hallazgos, gaps vs criterios, "
            "y veredicto approve|request_changes|comment."
        ),
        "include_web_search": False,
    },
}

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "flows" / "_simple_agent_template.json"


def ensure_template() -> None:
    """Fetch Simple Agent from Langflow if the local template is missing."""
    if TEMPLATE_PATH.exists():
        return
    from app.flow_client import LangflowClient

    client = LangflowClient()
    client.require_ready()
    flows = client.list_flows()
    base_flow = next((f for f in flows if f.get("name") == "Simple Agent"), None)
    if not base_flow:
        raise FileNotFoundError(
            f"Missing {TEMPLATE_PATH.name}. Open Langflow once so starter flows load, "
            "or copy Simple Agent export to flows/_simple_agent_template.json"
        )
    payload = {
        "name": base_flow["name"],
        "description": base_flow.get("description", ""),
        "data": base_flow["data"],
    }
    TEMPLATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _load_template_data() -> dict[str, Any]:
    ensure_template()
    template = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    return copy.deepcopy(template["data"])


def _set_agent_prompt(data: dict[str, Any], system_prompt: str) -> None:
    for node in data.get("nodes", []):
        if node.get("data", {}).get("type") != "Agent":
            continue
        template = node["data"]["node"]["template"]
        template["system_prompt"]["value"] = system_prompt
        return
    raise ValueError("Agent node not found in Simple Agent template")


def _inject_generate_image_tool(data: dict[str, Any], *, run_id: str = "playground") -> None:
    if not GENERATE_IMAGE_SNIPPET_PATH.exists():
        raise FileNotFoundError(
            f"Missing {GENERATE_IMAGE_SNIPPET_PATH.name}. Run: "
            "python scripts/build_tool_snippets.py"
        )
    snippet = json.loads(GENERATE_IMAGE_SNIPPET_PATH.read_text(encoding="utf-8"))
    node = copy.deepcopy(snippet["node"])
    node["data"]["node"]["template"]["run_id"]["value"] = run_id
    data["nodes"].append(node)
    data["edges"].append(copy.deepcopy(snippet["edge"]))


def build_agent_flow(agent: str) -> dict[str, Any]:
    """Return a Langflow-compatible flow cloned from Simple Agent."""
    cfg = AGENT_CONFIGS[agent]
    data = _load_template_data()

    remove_ids = set(REMOVE_NODE_IDS)
    if not cfg.get("include_web_search"):
        remove_ids.add(RESEARCHER_WEB_SEARCH_ID)

    data["nodes"] = [n for n in data["nodes"] if n.get("id") not in remove_ids]
    data["edges"] = [
        e
        for e in data.get("edges", [])
        if e.get("source") not in remove_ids and e.get("target") not in remove_ids
    ]

    _set_agent_prompt(data, cfg["system_prompt"])

    tool_node_ids: dict[str, str] = {}
    if cfg.get("include_web_search"):
        tool_node_ids["web_search"] = RESEARCHER_WEB_SEARCH_ID
    if cfg.get("include_generate_image"):
        _inject_generate_image_tool(data)
        tool_node_ids["generate_image"] = GENERATE_IMAGE_TOOL_ID

    return {
        "name": cfg["display_name"],
        "description": cfg["description"],
        "data": data,
        "metadata": {
            "agent": agent,
            "agent_node_id": AGENT_NODE_ID,
            "tool_node_ids": tool_node_ids,
        },
    }


def write_flow_files(output_dir: Path | None = None) -> list[Path]:
    out = output_dir or Path(__file__).resolve().parent.parent / "flows"
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for agent in AGENT_CONFIGS:
        flow = build_agent_flow(agent)
        path = out / f"{agent}.json"
        path.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written.append(path)
    manifest = {
        agent: {
            "file": f"{agent}.json",
            "agent_node_id": AGENT_NODE_ID,
            "tool_node_ids": build_agent_flow(agent)["metadata"]["tool_node_ids"],
        }
        for agent in AGENT_CONFIGS
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return written


def load_manifest() -> dict[str, Any]:
    path = Path(__file__).resolve().parent.parent / "flows" / "manifest.json"
    if not path.exists():
        write_flow_files()
    return json.loads(path.read_text(encoding="utf-8"))


def agent_node_id(agent: str | None = None) -> str:
    if agent:
        manifest = load_manifest()
        cfg = manifest.get(agent, {})
        if cfg.get("agent_node_id"):
            return str(cfg["agent_node_id"])
    return AGENT_NODE_ID


def tool_tweak_ids(agent: str) -> dict[str, str]:
    manifest = load_manifest()
    cfg = manifest.get(agent, {})
    tool_ids = cfg.get("tool_node_ids", {})
    if isinstance(tool_ids, dict):
        return {str(k): str(v) for k, v in tool_ids.items()}
    return {}


if __name__ == "__main__":
    paths = write_flow_files()
    print(f"Wrote {len(paths)} UI-compatible flow templates to flows/")
