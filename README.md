# Feature Delivery Agent Labs

Monorepo con **8 labs** que implementan el mismo pipeline multi-agente de desarrollo de software. Cada carpeta es un proyecto ejecutable e independiente; el código común vive en `shared/` y la base de conocimiento canónica en `knowledge-source/`.

**Patrón recomendado** para agentes independientes o encadenados: **LangGraph** ([langgraph-python](langgraph-python/), o [langgraph-typescript](langgraph-typescript/) en Node) más el **contrato de artefactos** compartido. Detalle, ranking y cuándo usar cada lab: [COMPARISON.md](COMPARISON.md#recommended-pattern).

## Layout

| Ruta | Rol |
|------|-----|
| `langgraph-python/`, `crewai-python/`, … | Labs (cada uno con su `./run.sh`) |
| [`shared/feature-delivery-tui/`](shared/feature-delivery-tui/) | TUI interactiva compartida (labs Python) |
| [`shared/feature-delivery-ui/`](shared/feature-delivery-ui/) | UI web abierta (React+Vite) servida en `/` |
| [`knowledge-source/`](knowledge-source/) | Docs de conocimiento canónicos |
| `*/knowledge/` | Copia local por lab (usada en runtime) |

## Pipeline común

**Entrada (español):** una feature en lenguaje natural.

**Salida:** `output/<run_id>/` con `research.md`, `plan.md`, `design.md`, `diagrams/*.mmd`, `assets/*.png`, `src/**`, `review.md`, `summary.json`

Cada agente escribe un artefacto en disco; el siguiente (si está seleccionado) lo lee desde el sandbox — no hay memoria conversacional compartida.

**Cómo se elige el camino**

- **Default** (sin `--agents`): `planner → designer → coder → reviewer`
- **Opt-in:** `researcher`, `diagrammer`, `illustrator` solo si van en `--agents`
- **Selectivo:** `--agents` elige un subconjunto; las fases no listadas **se omiten** (no hay camino forzado por todas las fases)
- **Prerequisitos por artefacto** (no por “pasar por todas las fases”): p. ej. `designer` / `coder` / `reviewer` necesitan `plan.md` / `design.md` (producidos en el mismo run o ya en el sandbox vía `--run-id`); `researcher` e `illustrator` no tienen prerequisitos

```mermaid
flowchart TD
  request[Feature request] --> pick["Elegir agentes con --agents"]
  pick --> run["Ejecutar solo los elegidos en orden canónico"]
  run --> sandbox["Artefactos en output/run_id"]
```

**Orden canónico** (referencia; solo corren los que estén en `--agents`):

`researcher → planner → designer → diagrammer → illustrator → coder → reviewer`

Rutas de ejemplo:

- Default: `planner → designer → coder → reviewer`
- Solo research + imagen: `researcher → illustrator` (salta planner, designer, coder y reviewer)

Las fases no seleccionadas se saltan. `--run-id` reanuda desde el sandbox. En LangGraph, si `coder` y `reviewer` están ambos seleccionados, el Reviewer puede devolver `request_changes` y reabrir el Coder (hasta ~2 pases); los demás labs aproximan la misma secuencia cuando esas fases están elegidas.

```mermaid
flowchart TD
  selected[Selected agents] --> sandbox["Sandbox output/run_id"]
  sandbox --> coder[Coder]
  coder --> reviewer[Reviewer]
  reviewer -->|"approve or comment"| done[Done]
  reviewer -->|request_changes| coder
```

La lógica vive en `run_feature_delivery` / `runFeatureDelivery` (el CLI solo la invoca). Cada lab también expone HTTP **sin autenticación**: `./run.sh serve` → UI abierta en [`http://127.0.0.1:8000/`](http://127.0.0.1:8000/), `POST /runs`, y Swagger en `/docs` (FastAPI en Python, Hono en TypeScript).

Ejecutar solo algunos agentes:

```bash
python -m app "Agregar autenticación JWT..." --agents planner,designer
python -m app "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
python -m app "Agregar autenticación JWT..." --run-id abc123 --agents coder,reviewer
python -m app "genera una imagen del presidente actual de chile" --agents researcher,illustrator
```

## Proyectos

| Carpeta | Tecnología | Tipo | Mental model |
|---------|------------|------|--------------|
| [langgraph-python](langgraph-python/) | LangGraph | Framework de orquestación | Grafo con estado (**recomendado**) |
| [crewai-python](crewai-python/) | CrewAI | Framework multi-agente | Roles + Crew |
| [smolagents-python](smolagents-python/) | smolagents (Hugging Face) | Librería | Code-first / tools |
| [openai-agents-python](openai-agents-python/) | OpenAI Agents SDK | SDK | Sequential agents |
| [langgraph-typescript](langgraph-typescript/) | LangGraph.js | Framework de orquestación | Mismo grafo en TS (**recomendado en TS**) |
| [mastra-typescript](mastra-typescript/) | Mastra | Framework | Workflows/agents TS |
| [ai-sdk-typescript](ai-sdk-typescript/) | Vercel AI SDK | SDK | `generateText` + tools + `stopWhen` |
| [langflow-python](langflow-python/) | Langflow | Plataforma visual (low-code) | UI visual + REST API, custom components |

Tipos:

- **Framework**: estructura de orquestación (grafo, crew, workflows) que impone el modelo mental del lab.
- **Librería**: API pequeña para agentes/tools; el lab arma el pipeline a mano.
- **SDK**: kit oficial del proveedor/stack LLM (Agents SDK, AI SDK).
- **Plataforma**: producto con UI + runtime propio (Langflow); el lab orquesta vía REST.

Ver [COMPARISON.md](COMPARISON.md) para el patrón recomendado, ranking y qué observar al comparar.

## Requisitos

**Opción A — Docker (recomendado si no querés instalar runtimes):** Docker Desktop / Engine + Compose v2. Ver [docker/README.md](docker/README.md).

**Opción B — local:**

- Python 3.11+ (proyectos Python)
- Node.js 20.6+ (proyectos TypeScript; Mastra / AI SDK lo exigen)
- **Langflow lab only:** Docker; `LANGFLOW_API_KEY` se genera en setup/server (ver [langflow-python](langflow-python/))

En ambos casos:

- API key de **OpenAI** y/o **DeepSeek**
- Búsqueda web: DuckDuckGo (sin API key extra)
- Imágenes (illustrator): `OPENAI_API_KEY` aunque el LLM use DeepSeek

## Clone y setup

```bash
git clone git@github.com:miguelcarrascoq/agents.git
cd agents
```

Copia `.env.example` → `.env` en el lab que vayas a usar (o deja que `./run.sh setup` lo haga).

**Secretos:** API keys y passwords van solo en `.env` local (gitignored). Nunca los commitees ni subas un zip del working tree. Los defaults de Langflow (`changeme-dev`, `AUTO_LOGIN=true`) son solo para lab local, no para un server expuesto.

### Run with Docker

```bash
cp langgraph-python/.env.example langgraph-python/.env   # agregar API keys
docker compose --profile langgraph-python up --build     # API en :8000
docker compose --profile langgraph-python run --rm langgraph-python \
  python -m app "Agregar autenticación JWT..." --agents planner,designer
```

Detalle (todos los labs, Langflow, TypeScript, rebuild de UI con `--no-cache`): [docker/README.md](docker/README.md).

### Run local (`./run.sh`)

#### Formas de uso

| Modo | Cómo |
|------|------|
| TUI interactiva | `./run.sh` (wizard Inquirer) |
| CLI one-shot | `./run.sh "…" [flags]` o `python -m app` / `npm start` |
| UI web + API | `./run.sh serve` → UI en `/`, `POST /runs`, Swagger en `/docs` |
| Docker | ver [docker/README.md](docker/README.md) |
| Programático | `run_feature_delivery` / `runFeatureDelivery` (ver README de cada lab) |

```bash
cd langgraph-python
./run.sh setup          # venv + pip install + .env
./run.sh                # wizard interactivo (default)
./run.sh --help         # flags disponibles
./run.sh serve          # UI web (/) + API + Swagger en http://127.0.0.1:8000/
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
./run.sh "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
./run.sh "genera una imagen del presidente actual de chile" --agents researcher,illustrator
```

Cada lab incluye su propio `./run.sh` con la misma interfaz (Python o Node por dentro). También podés usar el CLI directo:

```bash
python -m app "Agregar autenticación JWT..." --agents planner,designer
npm start -- "Agregar autenticación JWT..." --agents planner,designer
```

HTTP (mismo contrato en todos los labs):

```bash
./run.sh serve
curl -s -X POST http://127.0.0.1:8000/runs \
  -H 'Content-Type: application/json' \
  -d '{"request":"Agregar autenticación JWT...","agents":["planner","designer"]}'
```

## Idioma

- Inputs y artefactos: **español**
- Flags, tools y código: **inglés**
