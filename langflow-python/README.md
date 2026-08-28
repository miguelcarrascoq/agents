# Langflow — Feature Delivery Lab

Pipeline multi-agente vía **Langflow UI + REST API**. Mismo contrato que los otros labs; cada fase es un flow de Langflow editable visualmente.

**Default:** Planner → Designer → Coder → Reviewer  
**Opt-in:** Researcher, Diagrammer, Illustrator

## Requisitos extra (vs otros labs)

- **Docker + Docker Compose** — servidor Langflow
- **LANGFLOW_API_KEY** — Settings → API Keys en la UI
- **flows/flow_ids.json** — generado por `./run.sh bootstrap-flows`
- Puerto **7860** libre

## Setup

```bash
./run.sh setup
cp .env.example .env   # OPENAI_API_KEY, LANGFLOW_SUPERUSER_PASSWORD, …
./run.sh server          # http://localhost:7860
# UI: Settings → API Keys → copiar a LANGFLOW_API_KEY en .env
./run.sh bootstrap-flows # sube flows/*.json → flow_ids.json
```

**Importante:** Langflow 1.11+ exige `LANGFLOW_SUPERUSER_PASSWORD` en `.env` (si falta, el container crashea con `Username and password must be set`).

## Run

```bash
./run.sh              # wizard interactivo
./run.sh "Agregar autenticación JWT a una API de todos con refresh tokens"
./run.sh "Agregar autenticación JWT..." --agents researcher,planner,designer,diagrammer
./run.sh "genera una imagen del presidente actual de chile" --agents researcher,illustrator
```

Flags: `--provider openai|deepseek`, `--model`, `--run-id`, `--agents`, `-i`

## Arquitectura

```
./run.sh (CLI Python)  →  POST /api/v1/run/{flow_id}  →  Langflow (Docker)
                              ↓
                    output/<run_id>/  (sandbox compartido)
```

- **7 flows** (uno por agente) en `flows/`
- **7 custom tools** en `components/sandbox_tools.py` (montados en Docker)
- **Orquestador** en `app/pipeline.py` (orden, `--agents`, loop reviewer→coder)

## Comandos útiles

| Comando | Acción |
|---------|--------|
| `./run.sh server` | Levantar Langflow |
| `./run.sh server-stop` | Parar container |
| `./run.sh bootstrap-flows` | Subir flows y generar `flow_ids.json` |
| `./run.sh generate-flows` | Regenerar `flows/*.json` desde código |

## Custom components

Tras editar `components/`, regenera y reinicia:

```bash
python3 scripts/build_components.py
./run.sh server-stop && ./run.sh server
```

Los componentes deben ser **autocontenidos** (un `Component` por archivo `.py`); Langflow no soporta imports entre archivos en `components/`.

Los tools aparecen en la paleta Langflow bajo Search Knowledge, Web Search, etc.

## Programmatic use

```python
from app import run_feature_delivery

result = run_feature_delivery(
    "Agregar autenticación JWT...",
    agents=["planner", "designer"],
)
print(result.output_dir)
```

## Mental model

UI-first: editas prompts y wiring en Langflow; el CLI Python orquesta fases vía API REST. Paridad de tools y artefactos con LangGraph/CrewAI/smolagents.
