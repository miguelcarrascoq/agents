#!/usr/bin/env bash
set -euo pipefail

RUN_KIND="python"
PROJECT_NAME="openai-agents-python"
SUPPORTS_QUIET="false"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<EOF
Usage: ./run.sh [setup | serve | --help | -h | --interactive | -i] ["<feature en español>"] [options]

Project: ${PROJECT_NAME}

Commands:
  setup             venv + pip install + .env
  serve             HTTP API (Swagger UI at http://127.0.0.1:8000/docs)

Options (passed to pipeline):
  --provider openai|deepseek
  --model NAME
  --run-id ID
  --agents researcher,planner,designer,diagrammer,illustrator,coder,reviewer

Examples:
  ./run.sh
  ./run.sh setup
  ./run.sh serve
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
  pip install -e ../shared/feature-delivery-api --force-reinstall
  if [[ ! -f .env ]] && [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit your API keys."
  fi
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
  if ! python -c "from feature_delivery_api import serve" 2>/dev/null; then
    echo "Updating HTTP API package…" >&2
    pip install -e ../shared/feature-delivery-api --force-reinstall -q
  fi
}

run_app() {
  ensure_ready
  exec python -m app "$@"
}

run_serve() {
  ensure_ready
  shift
  exec python -m app.api "$@"
}

if [[ $# -eq 0 ]]; then
  run_app --interactive
elif [[ "$1" == "setup" ]]; then
  cmd_setup
elif [[ "$1" == "serve" ]]; then
  run_serve "$@"
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
else
  run_app "$@"
fi
