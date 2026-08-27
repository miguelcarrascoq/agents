#!/usr/bin/env bash
set -euo pipefail

RUN_KIND="node"
PROJECT_NAME="langgraph-typescript"
SUPPORTS_QUIET="false"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<EOF
Usage: ./run.sh [setup | --help | -h | --interactive | -i] ["<feature en español>"] [options]

Project: ${PROJECT_NAME}

Options (passed to pipeline):
  --provider openai|deepseek
  --model NAME
  --run-id ID
  --agents researcher,planner,designer,diagrammer,illustrator,coder,reviewer

Examples:
  ./run.sh
  ./run.sh setup
  ./run.sh "Agregar autenticación JWT..." --agents planner,designer
EOF
}

cmd_setup() {
  npm install
  if [[ ! -f .env ]] && [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit your API keys."
  fi
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

if [[ $# -eq 0 ]]; then
  run_app --interactive
elif [[ "$1" == "setup" ]]; then
  cmd_setup
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
else
  run_app "$@"
fi
