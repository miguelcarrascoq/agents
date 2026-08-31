# Comparison guide

Same feature-delivery pipeline in eight labs / stacks. Use this checklist while you run the same Spanish prompt in each lab.

## Recommended pattern

For agents that must run **independently or chained**, start with **LangGraph** ([langgraph-python](langgraph-python/), or [langgraph-typescript](langgraph-typescript/) on Node). It is the only mental model here that covers both modes well:

| Need | How LangGraph covers it in this lab |
|------|-------------------------------------|
| Independent | Each agent is a **node** (function over shared `GraphState`); CLI invokes `nodes[phase](state)` via `--agents` |
| Chained | Explicit edges (`researcher → planner → …`) + **conditional edges** (reviewer → coder loop) |
| Phase contract | Typed state + on-disk artifacts (`plan.md`, `design.md`, …) via the sandbox |
| Resume | `--run-id` + `load_artifacts` — no need to re-run the full graph |

The stronger pattern across this monorepo is the **shared artifact contract** below, not “Crew vs Graph.” Any framework should serve that contract (public API, sandbox tools, selective `--agents`, resume via `--run-id`), not replace it. Keep orchestration **deterministic**; the LLM lives *inside* each node.

### When to use which lab

1. **LangGraph (Python or TS)** — Default for production-style pipelines with branches, retries, and resume.
2. **OpenAI Agents SDK** — Agents-as-objects + tools + native handoffs; OpenAI-first DX. This lab chains with a `for` + `Runner.run` per phase (strong units; weaker than LangGraph for complex control flow).
3. **AI SDK (TypeScript)** — Bare `generateText` + `tool` + `stopWhen`; lightest TS surface for the shared contract. Prefer when you want Vercel AI SDK without a workflow framework.
4. **Mastra** — Agents + workflow steps on top of AI SDK; prefer over bare AI SDK only if you already live in Mastra.
5. **CrewAI** — Fast role/goal narrative; weaker for explicit state, loops, and “run only coder.”
6. **smolagents** — Minimal surface; good for one tool-calling agent or short chains, not serious multi-phase orchestration.
7. **Langflow** — Visual / non-dev prototyping; not ideal for versioning independent agents as code.

### Frameworks?

Yes, but **thin and purposeful**:

- Use a framework for shared typed state, branches/loops, checkpoints, tracing, typed handoffs, or a settled LLM/tools stack.
- Skip a heavy multi-agent narrative core (CrewAI/Langflow as the system of record) if the pipeline is a fixed linear sequence: a loop + artifacts + tool-calling is enough.
- Rule of thumb: **framework for orchestration and agents; your code for artifact contract, sandbox, and API.**

## Mental models

| Project | Type | How orchestration looks | Best for noticing… |
|---------|------|-------------------------|--------------------|
| langgraph-python | Orchestration framework | Explicit nodes + edges over shared state | Control flow, optional review→code loops, checkpointing story (**recommended default**) |
| crewai-python | Multi-agent framework | Role / goal / backstory + sequential tasks | Fastest multi-agent narrative; less explicit state machine |
| smolagents-python | Library | Tool-calling / code agents | Minimal framework surface; agent drives tools |
| openai-agents-python | SDK | Agents + handoffs | Delegation primitives; OpenAI-native DX |
| langgraph-typescript | Orchestration framework | Same graph idea in JS/TS | Language ergonomics vs langgraph-python (**recommended on TS**) |
| mastra-typescript | Framework | Agents + workflow steps | TS-native workflows, typed steps |
| ai-sdk-typescript | SDK | `generateText` + tools + `stopWhen` | Vercel AI SDK tool loop without Mastra/LangGraph |
| langflow-python | Visual platform | 7 agent flows in UI + Python REST orchestrator | Visual editing, custom components, API-first deployment |

## Shared contract

- Public API: `run_feature_delivery` / `runFeatureDelivery`
- Tools: `search_knowledge`, `web_search`, `write_file`, `write_mermaid`, `generate_image`, `read_file`, `list_files`
- Artifacts: `research.md`, `plan.md`, `design.md`, `diagrams/*.mmd`, `assets/*.png`, `src/**`, `review.md`, `summary.json`
- User input language: Spanish; CLI flags: English
- Agents (default): `planner`, `designer`, `coder`, `reviewer`
- Agents (opt-in): `researcher`, `diagrammer`, `illustrator`
- Full order: `researcher → planner → designer → diagrammer → illustrator → coder → reviewer`
- Selective run: `--agents researcher,planner` or `--agents researcher,illustrator` (illustrator does not require plan/design)
- Resume artifacts: `--run-id <existing>` (loads `plan.md`, `design.md`, etc. from sandbox)
- Interactive run: `./run.sh` or `-i` / `--interactive` (CLI wizard: InquirerPy in Python, @inquirer/prompts in TS)

Phases stay decoupled via **artifacts on disk**, not opaque chat memory: run one agent alone when prerequisites exist, or chain the same set in order (with loops where the graph defines them).

## Docker (all labs)

Same pipeline without local Python/Node: from the repo root, `docker compose --profile <lab> up --build` or `run --rm …`. Details: [docker/README.md](docker/README.md). Equivalent to `./run.sh serve` / CLI for comparing frameworks.

## `./run.sh` (all labs)

Same interface in every project folder:

| Command | Action |
|---------|--------|
| `./run.sh setup` | Install deps + copy `.env.example` → `.env` if missing |
| `./run.sh` | Interactive wizard (pick agents, provider, etc.; Esc cancels) |
| `./run.sh --help` | Show flags and examples |
| `./run.sh "feature..." [flags]` | Direct pipeline run |
| `./run.sh serve` | UI web (`/`) + API (`POST /runs`) + Swagger (`/docs`) |

**langflow-python only:**

| Command | Action |
|---------|--------|
| `./run.sh server` | Start Langflow Docker (UI at :7860) |
| `./run.sh bootstrap-flows` | Upload flows + write `flows/flow_ids.json` |
| `./run.sh generate-flows` | Regenerate `flows/*.json` templates |

## Understanding output

All labs print a **pipeline-level banner** before each phase:

```
════════════════════════════════════════
Pipeline 2/4 · designer
(run_id=abc123 · smolagents)
════════════════════════════════════════
```

Framework-specific logs below that banner are **internal agent turns**, not pipeline phases. In smolagents, repeated `Step 1`, `Step 2`, … reset per agent — use the banner to know which phase is running.

Use `--quiet` (smolagents only) to suppress internal Step output.

## What to compare

1. **Declarativity** — How much graph/crew config vs imperative Python/TS?
2. **State** — Explicit shared state (LangGraph) vs task outputs / conversation?
3. **Tools** — How awkward is wiring the same seven tools?
4. **External integrations** — DuckDuckGo web search (no key), Mermaid files, OpenAI Images (illustrator)
5. **Handoffs** — Built-in (OpenAI SDK) vs edges vs next task?
6. **DX** — Time to first successful run; error messages; docs fit.
7. **API readiness** — Is the CLI a thin wrapper over a library function? (all labs yes)

## Suggested prompts

Default pipeline:

```text
Agregar autenticación JWT a una API de todos con refresh tokens
```

Extended pipeline (research + diagrams):

```bash
python -m app "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
```

Run it in two providers (`--provider openai` and `--provider deepseek`) on at least LangGraph + CrewAI + one TypeScript lab.
