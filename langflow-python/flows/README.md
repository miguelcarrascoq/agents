# Feature Delivery — Langflow flows

Each JSON file is one **agent flow** (Researcher, Planner, …) exported/imported via Langflow.

## Files

| File | Agent | Tools |
|------|-------|-------|
| `researcher.json` | Researcher | web_search, search_knowledge, write_file |
| `planner.json` | Planner | search_knowledge, write_file |
| `designer.json` | Designer | search_knowledge, write_file |
| `diagrammer.json` | Diagrammer | write_mermaid |
| `illustrator.json` | Illustrator | generate_image (wired to Agent), read_file |
| `coder.json` | Coder | search_knowledge, write_file, read_file |
| `reviewer.json` | Reviewer | search_knowledge, read_file, list_files, write_file |

## Setup flow IDs

1. Start Langflow: `../run.sh server` (waits for health; uploads flows if `flow_ids.json` is missing)
2. Or force re-sync: `../run.sh bootstrap-flows`

This writes `flow_ids.json` (gitignored) mapping agent names to Langflow flow UUIDs.

`LANGFLOW_API_KEY` is set in `.env` (`LANGFLOW_API_KEY_SOURCE=env`); no UI API Keys step.

Langflow DB/UI state persists under `data/langflow/`. Wipe with `rm -rf data/langflow flows/flow_ids.json` then `../run.sh server`.

## Edit in UI

Open http://localhost:7860, import or edit flows, then re-export JSON here and re-run `bootstrap-flows`.

Regenerate templates from code: `../run.sh generate-flows`

Templates clone Langflow's built-in **Simple Agent** (`flows/_simple_agent_template.json`) so flows open correctly in the UI editor. Do not hand-edit minimal node JSON — it crashes the flow canvas.
