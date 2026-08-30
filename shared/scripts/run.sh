#!/usr/bin/env bash
# Template: copy to each lab and set RUN_KIND, PROJECT_NAME, SUPPORTS_QUIET.
set -euo pipefail

RUN_KIND="${RUN_KIND:-python}"
PROJECT_NAME="${PROJECT_NAME:-feature-delivery}"
SUPPORTS_QUIET="${SUPPORTS_QUIET:-false}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<EOF
Usage: ./run.sh [setup | serve | --help | -h | --interactive | -i] ["<feature en español>"] [options]

Project: ${PROJECT_NAME}

Commands:
  setup             install deps + .env
  serve             HTTP API (Swagger UI at http://127.0.0.1:8000/docs)

Options (passed to pipeline):
  --provider openai|deepseek
  --model NAME
  --run-id ID
  --agents researcher,planner,designer,diagrammer,illustrator,coder,reviewer
EOF
  if [[ "$SUPPORTS_QUIET" == "true" ]]; then
    echo "  --quiet          suppress smolagents Step output"
  fi
  cat <<EOF

Examples:
  ./run.sh
  ./run.sh setup
  ./run.sh serve
  ./run.sh "Agregar autenticación JWT..." --agents planner,designer
  ./run.sh --interactive
EOF
}

cmd_setup() {
  if [[ "$RUN_KIND" == "python" ]]; then
    if [[ ! -d .venv ]]; then
      python3 -m venv .venv
    fi
    # shellcheck source=/dev/null
    source .venv/bin/activate
    pip install -e .
    if [[ -d ../shared/feature-delivery-tui ]]; then
      pip install -e ../shared/feature-delivery-tui --force-reinstall
    fi
    if [[ -d ../shared/feature-delivery-api ]]; then
      pip install -e ../shared/feature-delivery-api --force-reinstall
    fi
  else
    npm install
  fi
  if [[ ! -f .env ]] && [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit your API keys."
  fi
}

ensure_ready() {
  if [[ "$RUN_KIND" == "python" ]]; then
    if [[ ! -d .venv ]]; then
      echo "Missing .venv. Run: ./run.sh setup" >&2
      exit 1
    fi
    # shellcheck source=/dev/null
    source .venv/bin/activate
  elif [[ ! -d node_modules ]]; then
    echo "Missing node_modules. Run: ./run.sh setup" >&2
    exit 1
  fi
}

run_app() {
  ensure_ready
  if [[ "$RUN_KIND" == "python" ]]; then
    exec python -m app "$@"
  else
    exec npm start -- "$@"
  fi
}

run_serve() {
  ensure_ready
  shift
  if [[ "$RUN_KIND" == "python" ]]; then
    exec python -m app.api "$@"
  else
    exec npm run serve -- "$@"
  fi
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
