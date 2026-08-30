# LangGraph.js — Feature Delivery Lab

**Recommended pattern** for TypeScript in this monorepo (see [COMPARISON.md](../COMPARISON.md#recommended-pattern)): same graph as `langgraph-python` — nodes over shared state, edges + optional review→code loop, artifact contract on disk.

Same graph as `langgraph-python`: Planner → Designer → Coder → Reviewer (optional review→code loop).

Opt-in agents: **Researcher**, **Diagrammer**, **Illustrator**.

## Setup

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

## Next: HTTP API

Wrap `runFeatureDelivery` with Hono/Express (`POST /runs`).

## Mental model

Explicit `StateGraph` over shared state — compare directly with the Python LangGraph lab.
