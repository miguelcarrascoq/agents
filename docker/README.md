# Run labs with Docker

Need only **Docker** (Compose v2) and API keys — no local Python, Node, venv, or nvm.

Root compose file: [`../docker-compose.yml`](../docker-compose.yml). Images: [`Dockerfile.python`](Dockerfile.python), [`Dockerfile.node`](Dockerfile.node).

## Formas de uso

| Modo | Cómo (Compose) |
|------|----------------|
| UI web + API + Swagger | `docker compose --profile <lab> up` → `/`, `/runs`, `/docs` |
| CLI one-shot | `docker compose --profile <lab> run --rm …` |
| TUI interactiva | `docker compose --profile <lab> run --rm -it …` (necesita TTY) |
| Langflow UI (solo langflow) | profile `langflow-python` → `:7860` (+ lab en `:8000`) |

## Quick start

```bash
# from repo root
cp langgraph-python/.env.example langgraph-python/.env
# edit .env → OPENAI_API_KEY and/or DEEPSEEK_API_KEY / OPENROUTER_API_KEY

# HTTP API + open UI (http://127.0.0.1:8000/) + Swagger (/docs)
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

| Profile / service | Stack | Tipo | Host ports |
|-------------------|-------|------|------------|
| `langgraph-python` | Python + LangGraph | Framework de orquestación | `8000` |
| `crewai-python` | Python + CrewAI | Framework multi-agente | `8000` |
| `smolagents-python` | Python + smolagents | Librería | `8000` |
| `openai-agents-python` | Python + OpenAI Agents | SDK | `8000` |
| `langgraph-typescript` | TypeScript + LangGraph.js | Framework de orquestación | `8000` |
| `mastra-typescript` | TypeScript + Mastra | Framework | `8000` |
| `ai-sdk-typescript` | TypeScript + Vercel AI SDK | SDK | `8000` |
| `langflow-python` | Lab API + Langflow UI | Plataforma visual (low-code) | `8000` + `7860` |

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
# Lab UI:      http://127.0.0.1:8000/
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

## Docker vs host: pick one

`docker compose … up` and `./run.sh serve` are **two different servers** on the same URL (`http://127.0.0.1:8000/`). Do **not** run both.

| Modo | Qué corre | De dónde sale la UI |
|------|-----------|---------------------|
| Docker | contenedor (`python -m app.api` en la imagen) | `dist/` **horneado en la imagen** al `build` |
| Host | `./run.sh serve` en tu macOS | `shared/feature-delivery-ui/dist` **en el disco del host** |

Si haces `build --no-cache` + `up` y después `cd langgraph-python && ./run.sh serve`, estás mirando (o pelean por el puerto) el `dist/` local — que `ensure-ui` **no regenera** si ya existe `dist/index.html`. El rebuild de Docker no actualiza ese `dist/` del host.

**Solo Docker** (después del rebuild, abre `:8000` y listo — sin `./run.sh`):

```bash
docker compose --profile langgraph-python build --no-cache langgraph-python
docker compose --profile langgraph-python up --force-recreate
# → http://127.0.0.1:8000/   (hard-refresh del browser)
```

**Solo host** (sin contenedor en `:8000`):

```bash
docker compose --profile langgraph-python down   # libera el puerto si hacía falta
cd shared/feature-delivery-ui && npm install && npm run build
cd ../../langgraph-python && ./run.sh serve
```

**UI en desarrollo** (hot reload): API en `:8000` (Docker **o** `./run.sh serve`) + Vite en otra terminal → `http://localhost:5173/` — ver [`../shared/feature-delivery-ui/README.md`](../shared/feature-delivery-ui/README.md).

## Rebuild UI / code after changes (Docker)

The shared web UI is **compiled inside the image** (`npm run build` in the Dockerfiles) and copied into the image. It is **not** bind-mounted from the host.

`docker compose … up --build` often finishes with every step `CACHED` — including `RUN npm run build` — so the old UI stays. `Attaching to <service>` is normal (foreground logs), not a hang.

```bash
# from repo root — Ctrl+C the current `up` first if it is attached
docker compose --profile langgraph-python build --no-cache langgraph-python
docker compose --profile langgraph-python up --force-recreate
# do NOT also run ./run.sh serve
```

Confirm the build log shows `RUN npm run build` **without** `CACHED`, then hard-refresh the browser (`Cmd+Shift+R`).

Same pattern for any profile: replace `langgraph-python` with the service name.

## Notes

- **API keys:** never bake secrets into images; use each lab’s `.env` (`env_file`).
- **Interactive TUI:** requires `docker compose run --rm -it …`. Prefer CLI args or `serve` in CI / non-TTY shells.
- **Windows:** use Docker Desktop; run commands from the repo root in PowerShell or WSL2. Prefer `serve` / one-shot over the Inquirer wizard if the terminal has no TTY.
- **Host `./run.sh`:** always runs on the host OS (venv + host `dist/`). Inside a container use `docker compose … exec` / `run` with `python -m app …` — not `./run.sh`.
