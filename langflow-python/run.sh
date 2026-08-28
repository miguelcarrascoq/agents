#!/usr/bin/env bash
set -euo pipefail

RUN_KIND="python"
PROJECT_NAME="langflow-python"
SUPPORTS_QUIET="false"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<EOF
Usage: ./run.sh [setup | server | bootstrap-flows | --help | -h | --interactive | -i] ["<feature en español>"] [options]

Project: ${PROJECT_NAME} (Langflow UI + REST API)

Commands:
  setup             venv + pip install + .env
  server            start Langflow via docker compose (UI at http://localhost:7860)
  server-stop       stop Langflow container
  bootstrap-flows   upload flows/*.json and write flows/flow_ids.json
  generate-flows    regenerate flows/*.json templates

Options (passed to pipeline):
  --provider openai|deepseek
  --model NAME
  --run-id ID
  --agents researcher,planner,designer,diagrammer,illustrator,coder,reviewer

Examples:
  ./run.sh setup
  ./run.sh server
  ./run.sh bootstrap-flows
  ./run.sh
  ./run.sh "Agregar autenticación JWT..." --agents planner,designer
EOF
}

cmd_setup() {
  if [[ ! -d .venv ]]; then
    python3 -m venv .venv
  fi
  # shellcheck source=/dev/null
  source .venv/bin/activate
  pip install -e .
  pip install -e ../shared/feature-delivery-tui --force-reinstall
  if [[ ! -f .env ]] && [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit your API keys."
  fi
  if [[ ! -f flows/flow_ids.json ]] && [[ -f flows/flow_ids.example.json ]]; then
    echo "Note: run ./run.sh server then ./run.sh bootstrap-flows to register flow IDs."
  fi
  mkdir -p output knowledge
}

ensure_ready() {
  if [[ ! -d .venv ]]; then
    echo "Missing .venv. Run: ./run.sh setup" >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source .venv/bin/activate
  if ! python -c "from InquirerPy import inquirer" 2>/dev/null; then
    echo "Updating interactive wizard (InquirerPy)…" >&2
    pip install -e ../shared/feature-delivery-tui --force-reinstall -q
  fi
}

compose() {
  docker compose --project-directory "$ROOT" -f docker/docker-compose.yml "$@"
}

cmd_server() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required. Install Docker Desktop and retry." >&2
    exit 1
  fi
  if [[ ! -f .env ]]; then
    echo "Missing .env. Run: ./run.sh setup" >&2
    exit 1
  fi
  if ! grep -q '^LANGFLOW_SUPERUSER_PASSWORD=.' .env 2>/dev/null; then
    echo "Add LANGFLOW_SUPERUSER_PASSWORD to .env (see .env.example)." >&2
    exit 1
  fi
  compose up -d
  echo "Langflow UI: http://localhost:7860"
  echo "Next: create API key in Settings → API Keys, add LANGFLOW_API_KEY to .env"
  echo "Then: ./run.sh bootstrap-flows"
}

cmd_server_stop() {
  compose down
}

cmd_bootstrap_flows() {
  ensure_ready
  python scripts/bootstrap_flows.py
}

cmd_generate_flows() {
  ensure_ready
  python -m app.flow_templates
}

run_app() {
  ensure_ready
  exec python -m app "$@"
}

if [[ $# -eq 0 ]]; then
  run_app --interactive
elif [[ "$1" == "setup" ]]; then
  cmd_setup
elif [[ "$1" == "server" ]]; then
  cmd_server
elif [[ "$1" == "server-stop" ]]; then
  cmd_server_stop
elif [[ "$1" == "bootstrap-flows" ]]; then
  cmd_bootstrap_flows
elif [[ "$1" == "generate-flows" ]]; then
  cmd_generate_flows
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
else
  run_app "$@"
fi
