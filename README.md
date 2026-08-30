# Feature Delivery Agent Labs

Monorepo con **7 labs** que implementan el mismo pipeline multi-agente de desarrollo de software. Cada carpeta es un proyecto ejecutable e independiente; el código común vive en `shared/` y la base de conocimiento canónica en `knowledge-source/`.

## Layout

| Ruta | Rol |
|------|-----|
| `langgraph-python/`, `crewai-python/`, … | Labs (cada uno con su `./run.sh`) |
| [`shared/feature-delivery-tui/`](shared/feature-delivery-tui/) | TUI interactiva compartida (labs Python) |
| [`knowledge-source/`](knowledge-source/) | Docs de conocimiento canónicos |
| `*/knowledge/` | Copia local por lab (usada en runtime) |

## Pipeline común

**Entrada (español):** una feature en lenguaje natural.

**Agentes (default):** Planner → Designer → Coder → Reviewer

**Agentes (opt-in):** Researcher, Diagrammer, Illustrator

**Salida:** `output/<run_id>/` con `research.md`, `plan.md`, `design.md`, `diagrams/*.mmd`, `assets/*.png`, `src/**`, `review.md`, `summary.json`

La lógica vive en `run_feature_delivery` / `runFeatureDelivery` (el CLI solo la invoca). Luego puedes envolverla en HTTP (FastAPI / Hono) sin reescribir el pipeline.

Ejecutar solo algunos agentes:

```bash
python -m app "Agregar autenticación JWT..." --agents planner,designer
python -m app "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
python -m app "Agregar autenticación JWT..." --run-id abc123 --agents coder,reviewer
python -m app "genera una imagen del presidente actual de chile" --agents researcher,illustrator
```

## Proyectos

| Carpeta | Stack | Mental model |
|---------|--------|--------------|
| [langgraph-python](langgraph-python/) | Python + LangGraph | Grafo con estado |
| [crewai-python](crewai-python/) | Python + CrewAI | Roles + Crew |
| [smolagents-python](smolagents-python/) | Python + smolagents | Code-first / tools |
| [openai-agents-python](openai-agents-python/) | Python + OpenAI Agents SDK | Sequential agents |
| [langgraph-typescript](langgraph-typescript/) | TypeScript + LangGraph.js | Mismo grafo en TS |
| [mastra-typescript](mastra-typescript/) | TypeScript + Mastra | Workflows/agents TS |
| [langflow-python](langflow-python/) | Python + Langflow | UI visual + REST API, custom components |

Ver [COMPARISON.md](COMPARISON.md) para qué observar al comparar.

## Requisitos

- Python 3.11+ (proyectos Python)
- Node.js 20.6+ (proyectos TypeScript; Mastra lo exige)
- API key de **OpenAI** y/o **DeepSeek**
- Búsqueda web: DuckDuckGo (sin API key extra)
- Imágenes (illustrator): `OPENAI_API_KEY` aunque el LLM use DeepSeek
- **Langflow lab only:** Docker; `LANGFLOW_API_KEY` se genera en setup/server (ver [langflow-python](langflow-python/))

## Clone y setup

```bash
git clone git@github.com:miguelcarrascoq/agents.git
cd agents
```

Copia `.env.example` → `.env` en el lab que vayas a usar (o deja que `./run.sh setup` lo haga).

**Secretos:** API keys y passwords van solo en `.env` local (gitignored). Nunca los commitees ni subas un zip del working tree. Los defaults de Langflow (`changeme-dev`, `AUTO_LOGIN=true`) son solo para lab local, no para un server expuesto.

```bash
cd langgraph-python
./run.sh setup          # venv + pip install + .env
./run.sh                # wizard interactivo (default)
./run.sh --help         # flags disponibles
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
./run.sh "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
./run.sh "genera una imagen del presidente actual de chile" --agents researcher,illustrator
```

Cada lab incluye su propio `./run.sh` con la misma interfaz (Python o Node por dentro). También podés usar el CLI directo:

```bash
python -m app "Agregar autenticación JWT..." --agents planner,designer
npm start -- "Agregar autenticación JWT..." --agents planner,designer
```

## Idioma

- Inputs y artefactos: **español**
- Flags, tools y código: **inglés**
