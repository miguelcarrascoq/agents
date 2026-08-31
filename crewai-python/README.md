# CrewAI — Feature Delivery Lab

**Tecnología:** CrewAI — framework multi-agente (roles + crew).

Pipeline multi-agente por roles: Planner, Designer, Coder, Reviewer en secuencia.

Agentes opt-in: **Researcher**, **Diagrammer**, **Illustrator**.

## Setup

Also runnable with Docker only (no local Python): see [docker/README.md](../docker/README.md).

```bash
./run.sh setup
# or manually:
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env
```

## Formas de uso

| Modo | Cómo |
|------|------|
| TUI interactiva | `./run.sh` (wizard Inquirer) |
| CLI one-shot | `./run.sh "…" [flags]` o `python -m app` |
| UI web + API | `./run.sh serve` → UI en `/`, `POST /runs`, Swagger en `/docs` |
| Docker | ver [docker/README.md](../docker/README.md) |
| Programático | `run_feature_delivery` (abajo) |

```bash
./run.sh              # interactive wizard
./run.sh --help
./run.sh serve        # UI web (/) + API + Swagger (/docs)
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
```

## Interactive mode

`./run.sh` opens a CLI wizard (InquirerPy) to pick agents, provider, and options. Esc cancels cleanly.

## CLI

```bash
python -m app "Agregar autenticación JWT a una API de todos con refresh tokens"
python -m app "Agregar rate limiting al login" --provider deepseek

# Solo algunos agentes
python -m app "Agregar autenticación JWT..." --agents planner,designer
python -m app "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
python -m app "genera una imagen del presidente actual de chile" --agents researcher,illustrator
python -m app "Agregar autenticación JWT..." --run-id abc123 --agents coder,reviewer
```

Flags: `--provider`, `--model`, `--run-id`, `--agents`, `-i` / `--interactive`

## Understanding output

Antes de cada fase verás un banner `Pipeline N/M · <agente>`. Eso marca la fase del pipeline. El verbose de CrewAI debajo corresponde a la tarea interna de ese agente.

## Programmatic use

```python
from app import run_feature_delivery

result = run_feature_delivery(
    "Agregar autenticación JWT...",
    agents=["planner", "designer"],
)
```

## HTTP API

```bash
./run.sh serve
# UI web:  http://127.0.0.1:8000/
# Swagger: http://127.0.0.1:8000/docs
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/runs \
  -H 'Content-Type: application/json' \
  -d '{"request":"Agregar autenticación JWT...","agents":["planner","designer"]}'
```

Flags del servidor: `--host`, `--port` (o env `HOST` / `PORT`).

## Mental model

Role / goal / backstory + sequential tasks. Less explicit state machine than LangGraph; faster narrative setup.
