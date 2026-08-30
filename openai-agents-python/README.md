# OpenAI Agents SDK — Feature Delivery Lab

Pipeline secuencial: Planner → Designer → Coder → Reviewer (un `Runner.run` por fase).

Agentes opt-in: **Researcher**, **Diagrammer**, **Illustrator**.

## Setup

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
```

## Interactive mode

`./run.sh` opens a CLI wizard (InquirerPy) to configure the run. Esc cancels cleanly.

## CLI

```bash
python -m app "Agregar autenticación JWT a una API de todos con refresh tokens"
python -m app "Agregar rate limiting" --provider deepseek

# Solo algunos agentes
python -m app "Agregar autenticación JWT..." --agents planner,designer
python -m app "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
python -m app "genera una imagen del presidente actual de chile" --agents researcher,illustrator
python -m app "Agregar autenticación JWT..." --run-id abc123 --agents coder,reviewer
```

Flags: `--provider`, `--model`, `--run-id`, `--agents`, `-i` / `--interactive`

## Understanding output

Cada fase del pipeline se anuncia con un banner `Pipeline N/M · <agente>`. Los turnos internos del SDK ocurren debajo de ese banner.

## Programmatic use

```python
from app import run_feature_delivery

result = run_feature_delivery(
    "Agregar autenticación JWT...",
    agents=["reviewer"],
    run_id="abc123",
)
```

## HTTP API

```bash
./run.sh serve
# UI interactiva (Swagger): http://127.0.0.1:8000/docs
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/runs \
  -H 'Content-Type: application/json' \
  -d '{"request":"Agregar autenticación JWT...","agents":["planner","designer"]}'
```

Flags del servidor: `--host`, `--port` (o env `HOST` / `PORT`).

## Mental model

Agents + function tools, ejecutados en secuencia explícita (sin handoffs encadenados). DeepSeek via OpenAI-compatible `base_url`.
