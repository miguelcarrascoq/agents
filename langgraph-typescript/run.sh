#!/usr/bin/env bash
set -euo pipefail

RUN_KIND="node"
PROJECT_NAME="langgraph-typescript"
SUPPORTS_QUIET="false"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# shellcheck source=/dev/null
source "${ROOT}/../shared/scripts/ensure-ui.sh"

usage() {
  cat <<EOF
Usage: ./run.sh [setup | serve | --help | -h | --interactive | -i] ["<feature en español>"] [options]

Project: ${PROJECT_NAME}

Commands:
  setup             npm install + .env
  serve             open UI + API (http://127.0.0.1:8000/  ·  /docs)

Options (passed to pipeline):
  --provider openai|deepseek|openrouter
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
  npm install
  if [[ ! -f .env ]] && [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit your API keys."
  fi
  ensure_feature_delivery_ui || true
}

ensure_ready() {
  if [[ ! -d node_modules ]]; then
    echo "Missing node_modules. Run: ./run.sh setup" >&2
    exit 1
  fi
}

run_app() {
  ensure_ready
  exec npm start -- "$@"
}

run_serve() {
  ensure_ready
  ensure_feature_delivery_ui || true
  shift
  exec npm run serve -- "$@"
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
