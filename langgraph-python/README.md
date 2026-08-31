# LangGraph — Feature Delivery Lab

**Tecnología:** LangGraph — framework de orquestación (grafo con estado compartido).

**Patrón recomendado** del monorepo para agentes independientes o encadenados (ver [COMPARISON.md](../COMPARISON.md#recommended-pattern)): nodos sobre estado compartido, edges + loop Reviewer→Coder, y contrato de artefactos en disco.

Pipeline multi-agente: **Planner → Designer → Coder → Reviewer** (con posible loop Reviewer→Coder).

Agentes opt-in: **Researcher** (web), **Diagrammer** (Mermaid), **Illustrator** (imágenes OpenAI).

## Setup

Also runnable with Docker only (no local Python): see [docker/README.md](../docker/README.md).

```bash
./run.sh setup
# or manually:
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env  # add OPENAI_API_KEY and/or DEEPSEEK_API_KEY
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
./run.sh              # interactive wizard (default)
./run.sh --help       # flags and examples
./run.sh serve        # UI web (/) + API + Swagger (/docs)
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
```

## Interactive mode

`./run.sh` (or `python -m app --interactive`) opens a **CLI wizard** (InquirerPy): feature request → provider → agents (↑↓ + Space) → run-id → CLI preview → confirm. Esc cancels cleanly back to the shell.

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

Flags: `--provider openai|deepseek|openrouter`, `--model`, `--run-id`, `--agents`, `-i` / `--interactive`

## Understanding output

Cada nodo del grafo se anuncia con un banner `Pipeline N/M · <nodo>`. El loop Reviewer→Coder (si aplica) se indica con `(revision loop)` en el banner.

## Programmatic use

```python
from app import run_feature_delivery

result = run_feature_delivery(
    "Agregar autenticación JWT...",
    agents=["planner", "designer"],
    run_id="abc123",
)
print(result.output_dir)
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

Explicit `StateGraph` with shared state (`plan`, `design`, `review`, `files`) and a conditional edge after review.
