# Mastra — Feature Delivery Lab

Pipeline con **Agents + Workflow steps**: plan → design → code → review.

Opt-in agents: **Researcher**, **Diagrammer**, **Illustrator**.

## Setup

Requires Node.js **20.6+** (Mastra dependency).

```bash
./run.sh setup
# or manually:
npm install
cp .env.example .env
```

## Run (recommended)

```bash
./run.sh              # interactive wizard (inquirer)
./run.sh --help
./run.sh serve        # HTTP API + Swagger UI
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
```

## Interactive mode

`./run.sh` (or `npm start -- --interactive`) walks through provider, agents, run-id, CLI preview, and confirm. Esc cancels cleanly.

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

Cada step del workflow se anuncia con un banner `Pipeline N/M · <agente>`. Los pasos internos de Mastra (`plan`, `design`, etc.) ocurren debajo de ese banner.

## Programmatic use

```ts
import { runFeatureDelivery } from "./src/pipeline.ts";

const result = await runFeatureDelivery("Agregar autenticación JWT...", {
  agents: ["planner", "designer"],
});
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

Env: `HOST` / `PORT` (default `127.0.0.1:8000`).

## Mental model

TypeScript-native agents + typed workflow steps (Zod). Contrast with LangGraph.js explicit graph state.
