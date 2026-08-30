# Run labs with Docker

Need only **Docker** (Compose v2) and API keys — no local Python, Node, venv, or nvm.

Root compose file: [`../docker-compose.yml`](../docker-compose.yml). Images: [`Dockerfile.python`](Dockerfile.python), [`Dockerfile.node`](Dockerfile.node).

## Quick start

```bash
# from repo root
cp langgraph-python/.env.example langgraph-python/.env
# edit .env → OPENAI_API_KEY and/or DEEPSEEK_API_KEY

# HTTP API + Swagger (http://127.0.0.1:8000/docs)
docker compose --profile langgraph-python up --build

# One-shot pipeline (no interactive TUI)
docker compose --profile langgraph-python run --rm langgraph-python \
  python -m app "Agregar autenticación JWT..." --agents planner,designer

# Interactive wizard (needs a TTY)
docker compose --profile langgraph-python run --rm -it langgraph-python \
  python -m app --interactive
```

Artifacts land on the host under `<lab>/output/`. Knowledge is mounted read-only from `<lab>/knowledge/`.

## Profiles

| Profile / service | Stack | Host ports |
|-------------------|-------|------------|
| `langgraph-python` | Python + LangGraph | `8000` |
| `crewai-python` | Python + CrewAI | `8000` |
| `smolagents-python` | Python + smolagents | `8000` |
| `openai-agents-python` | Python + OpenAI Agents | `8000` |
| `langgraph-typescript` | TypeScript + LangGraph.js | `8000` |
| `mastra-typescript` | TypeScript + Mastra | `8000` |
| `ai-sdk-typescript` | TypeScript + Vercel AI SDK | `8000` |
| `langflow-python` | Lab API + Langflow UI | `8000` + `7860` |

Run **one profile at a time** (labs share host port `8000`).

### TypeScript labs

```bash
cp langgraph-typescript/.env.example langgraph-typescript/.env

docker compose --profile langgraph-typescript up --build

docker compose --profile langgraph-typescript run --rm langgraph-typescript \
  npm start -- "Agregar autenticación JWT..." --agents planner,designer

docker compose --profile langgraph-typescript run --rm -it langgraph-typescript \
  npm start -- --interactive
```

Same pattern for `mastra-typescript` and `ai-sdk-typescript`.

### Langflow lab

Starts the Langflow UI (`langflowai/langflow`) and the Python orchestrator. The orchestrator uses `LANGFLOW_URL=http://langflow:7860` on the Compose network.

```bash
cp langflow-python/.env.example langflow-python/.env
# fill OPENAI_API_KEY; setup/server normally auto-fills LANGFLOW_API_KEY / SECRET_KEY —
# if those are empty, copy values from a prior local setup or generate them (see langflow-python README)

docker compose --profile langflow-python up --build
# Langflow UI: http://127.0.0.1:7860
# Lab API:     http://127.0.0.1:8000/docs
```

Host-only path (Langflow in Docker, lab on the host) still works via [`../langflow-python/docker/docker-compose.yml`](../langflow-python/docker/docker-compose.yml) and `./run.sh server`.

## HTTP check

```bash
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/runs \
  -H 'Content-Type: application/json' \
  -d '{"request":"Agregar autenticación JWT...","agents":["planner","designer"]}'
```

## Notes

- **API keys:** never bake secrets into images; use each lab’s `.env` (`env_file`).
- **Interactive TUI:** requires `docker compose run --rm -it …`. Prefer CLI args or `serve` in CI / non-TTY shells.
- **Windows:** use Docker Desktop; run commands from the repo root in PowerShell or WSL2. Prefer `serve` / one-shot over the Inquirer wizard if the terminal has no TTY.
- **Rebuild after code changes:** `docker compose --profile <lab> build --no-cache` (or `up --build`).
- **Host `./run.sh`:** still supported if you have Python/Node installed locally.
