# smolagents — Feature Delivery Lab

Pipeline con `ToolCallingAgent`s en secuencia (Planner → Designer → Coder → Reviewer).

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

## Run (recommended)

```bash
./run.sh              # interactive wizard
./run.sh --help
./run.sh serve        # HTTP API + Swagger UI
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
./run.sh "Agregar autenticación JWT..." --quiet
```

## Interactive mode

`./run.sh` opens a CLI wizard (InquirerPy) with a **Quiet** step (smolagents-only). Esc cancels cleanly.

## CLI

```bash
python -m app "Agregar autenticación JWT a una API de todos con refresh tokens"

# Solo planner + designer
python -m app "Agregar autenticación JWT..." --agents planner,designer
python -m app "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
python -m app "genera una imagen del presidente actual de chile tomando mate" --agents researcher,illustrator

# Continuar un run existente (solo coder + reviewer)
python -m app "Agregar autenticación JWT..." --run-id abc123 --agents coder,reviewer

# Menos ruido interno de smolagents (solo errores)
python -m app "Agregar autenticación JWT..." --quiet
```

Flags: `--provider`, `--model`, `--run-id`, `--agents`, `--quiet`, `-i` / `--interactive`

## Understanding output

Antes de cada fase del pipeline verás un banner:

```
════════════════════════════════════════
Pipeline 1/2 · planner
(run_id=abc123 · smolagents)
════════════════════════════════════════
```

Los `Step 1`, `Step 2`, … que imprime smolagents **debajo** de ese banner son turnos internos del agente (LLM + tool calls), **no** fases del pipeline. El contador se reinicia en cada agente.

## Programmatic use

```python
from app import run_feature_delivery

result = run_feature_delivery(
    "Agregar autenticación JWT...",
    agents=["planner", "designer"],
    run_id="abc123",
    quiet=True,
)
```

## HTTP API

```bash
./run.sh serve
# UI interactiva (Swagger): http://127.0.0.1:8000/docs
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/runs \
  -H 'Content-Type: application/json' \
  -d '{"request":"Agregar autenticación JWT...","agents":["planner","designer"],"quiet":true}'
```

Flags del servidor: `--host`, `--port` (o env `HOST` / `PORT`). Body opcional `quiet` (smolagents).

## Mental model

Minimal tool-calling agents; the framework surface is small and the agent drives tools explicitly.
