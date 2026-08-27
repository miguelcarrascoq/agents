# Comparison guide

Same feature-delivery pipeline in six frameworks. Use this checklist while you run the same Spanish prompt in each lab.

## Mental models

| Project | How orchestration looks | Best for noticing… |
|---------|-------------------------|--------------------|
| langgraph-python | Explicit nodes + edges over shared state | Control flow, optional review→code loops, checkpointing story |
| crewai-python | Role / goal / backstory + sequential tasks | Fastest multi-agent narrative; less explicit state machine |
| smolagents-python | Tool-calling / code agents | Minimal framework surface; agent drives tools |
| openai-agents-python | Agents + handoffs | Delegation primitives; OpenAI-native DX |
| langgraph-typescript | Same graph idea in JS/TS | Language ergonomics vs langgraph-python |
| mastra-typescript | Agents + workflow steps | TS-native workflows, typed steps |

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

## `./run.sh` (all labs)

Same interface in every project folder:

| Command | Action |
|---------|--------|
| `./run.sh setup` | Install deps + copy `.env.example` → `.env` if missing |
| `./run.sh` | Interactive wizard (pick agents, provider, etc.; Esc cancels) |
| `./run.sh --help` | Show flags and examples |
| `./run.sh "feature..." [flags]` | Direct pipeline run |

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
