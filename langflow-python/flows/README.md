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

1. Start Langflow: `../run.sh server`
2. Create API key in UI → Settings → API Keys → add to `.env` as `LANGFLOW_API_KEY`
3. Upload flows: `../run.sh bootstrap-flows`

This writes `flow_ids.json` (gitignored) mapping agent names to Langflow flow UUIDs.

## Edit in UI

Open http://localhost:7860, import or edit flows, then re-export JSON here and re-run `bootstrap-flows`.

Regenerate templates from code: `../run.sh generate-flows`

Templates clone Langflow's built-in **Simple Agent** (`flows/_simple_agent_template.json`) so flows open correctly in the UI editor. Do not hand-edit minimal node JSON — it crashes the flow canvas.
