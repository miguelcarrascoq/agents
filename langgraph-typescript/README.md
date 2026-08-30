# LangGraph.js — Feature Delivery Lab

**Recommended pattern** for TypeScript in this monorepo (see [COMPARISON.md](../COMPARISON.md#recommended-pattern)): same graph as `langgraph-python` — nodes over shared state, edges + optional review→code loop, artifact contract on disk.

Same graph as `langgraph-python`: Planner → Designer → Coder → Reviewer (optional review→code loop).

Opt-in agents: **Researcher**, **Diagrammer**, **Illustrator**.

## Setup

Also runnable with Docker only (no local Node): see [docker/README.md](../docker/README.md).

```bash
./run.sh setup
# or manually:
npm install
cp .env.example .env
```

## Formas de uso

| Modo | Cómo |
|------|------|
| TUI interactiva | `./run.sh` (wizard Inquirer) |
| CLI one-shot | `./run.sh "…" [flags]` o `npm start` |
| UI web + API | `./run.sh serve` → UI en `/`, `POST /runs`, Swagger en `/docs` |
| Docker | ver [docker/README.md](../docker/README.md) |
| Programático | `runFeatureDelivery` (abajo) |

```bash
./run.sh              # interactive wizard (inquirer)
./run.sh --help
./run.sh serve        # UI web (/) + API + Swagger (/docs)
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
```

## Interactive mode

`./run.sh` (or `npm start -- --interactive`) walks through provider, agents (↑↓ + Space), run-id, CLI preview, and confirm. Esc cancels cleanly.

## CLI

```bash
npm start -- "Agregar autenticación JWT a una API de todos con refresh tokens"
npm start -- "Agregar rate limiting" --provider deepseek

# Solo algunos agentes
npm start -- "Agregar autenticación JWT..." --agents planner,designer
npm start -- "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
npm start -- "genera una imagen del presidente actual de chile" --agents researcher,illustrator
npm start -- "Agregar autenticación JWT..." --run-id abc123 --agents coder,reviewer
```

Flags: `--provider`, `--model`, `--run-id`, `--agents`, `-i` / `--interactive`

## Understanding output

Cada nodo se anuncia con un banner `Pipeline N/M · <nodo>`. Compare con el lab Python para ver diferencias de logging del framework.

## Programmatic use

```ts
import { runFeatureDelivery } from "./src/pipeline.ts";

const result = await runFeatureDelivery("Agregar autenticación JWT...", {
  agents: ["planner", "designer"],
  runId: "abc123",
});
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

Env: `HOST` / `PORT` (default `127.0.0.1:8000`).

## Mental model

Explicit `StateGraph` over shared state — compare directly with the Python LangGraph lab.
