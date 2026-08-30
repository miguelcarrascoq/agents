#!/usr/bin/env bash
set -euo pipefail

RUN_KIND="python"
PROJECT_NAME="langflow-python"
SUPPORTS_QUIET="false"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<EOF
Usage: ./run.sh [setup | server | serve | bootstrap-flows | --help | -h | --interactive | -i] ["<feature en español>"] [options]

Project: ${PROJECT_NAME} (Langflow UI + REST API)

Commands:
  setup             venv + pip install + .env (+ auto Langflow keys)
  server            start Langflow, wait healthy, bootstrap flows if needed
  server-stop       stop Langflow container
  serve             lab HTTP API (Swagger at http://127.0.0.1:8000/docs; distinct from Langflow :7860)
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
  ./run.sh serve
  ./run.sh bootstrap-flows
  ./run.sh
  ./run.sh "Agregar autenticación JWT..." --agents planner,designer
EOF
}

# Ensure KEY=VALUE exists in .env; generate if missing/empty.
# mode: hex (default) | fernet (32 url-safe base64 bytes for LANGFLOW_SECRET_KEY)
ensure_env_secret() {
  local key="$1"
  local mode="${2:-hex}"
  local val=""
  if [[ -f .env ]]; then
    val="$(grep -E "^${key}=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  fi
  if [[ -n "${val}" ]]; then
    return 0
  fi
  local generated
  if [[ "${mode}" == "fernet" ]]; then
    # Fernet: 32 url-safe base64-encoded bytes (trailing =)
    generated="$(python3 -c 'import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
  else
    generated="$(openssl rand -hex 32)"
  fi
  if grep -qE "^${key}=" .env 2>/dev/null; then
    # portable in-place edit without requiring GNU sed
    local tmp
    tmp="$(mktemp)"
    awk -v k="${key}" -v v="${generated}" '
      BEGIN { done=0 }
      $0 ~ "^" k "=" {
        if (!done) { print k "=" v; done=1; next }
      }
      { print }
      END { if (!done) print k "=" v }
    ' .env >"$tmp"
    mv "$tmp" .env
  else
    printf '%s=%s\n' "${key}" "${generated}" >>.env
  fi
  echo "Generated ${key} in .env"
}

# Replace LANGFLOW_SECRET_KEY if empty or not a valid Fernet key.
ensure_langflow_secret_key() {
  local val=""
  if [[ -f .env ]]; then
    val="$(grep -E '^LANGFLOW_SECRET_KEY=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  fi
  if [[ -n "${val}" ]] && python3 -c "
import base64, sys
k = sys.argv[1].encode()
try:
    raw = base64.urlsafe_b64decode(k)
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if len(raw) == 32 else 1)
" "${val}" 2>/dev/null; then
    return 0
  fi
  # Clear invalid/empty value so ensure_env_secret regenerates as Fernet
  if grep -qE '^LANGFLOW_SECRET_KEY=' .env 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    awk '
      BEGIN { done=0 }
      /^LANGFLOW_SECRET_KEY=/ {
        if (!done) { print "LANGFLOW_SECRET_KEY="; done=1; next }
      }
      { print }
      END { if (!done) print "LANGFLOW_SECRET_KEY=" }
    ' .env >"$tmp"
    mv "$tmp" .env
  else
    printf 'LANGFLOW_SECRET_KEY=\n' >>.env
  fi
  ensure_env_secret LANGFLOW_SECRET_KEY fernet
}

ensure_langflow_env_keys() {
  if [[ ! -f .env ]]; then
    echo "Missing .env. Run: ./run.sh setup" >&2
    exit 1
  fi
  if ! grep -qE '^LANGFLOW_API_KEY_SOURCE=' .env 2>/dev/null; then
    printf '\nLANGFLOW_API_KEY_SOURCE=env\n' >>.env
  fi
  ensure_env_secret LANGFLOW_API_KEY
  ensure_langflow_secret_key
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
    echo "Created .env from .env.example — edit OPENAI_API_KEY (and other LLM keys)."
  fi
  ensure_langflow_env_keys
  if [[ ! -f flows/flow_ids.json ]]; then
    echo "Note: ./run.sh server will upload flows and write flow_ids.json on first start."
  fi
  mkdir -p output knowledge data/langflow
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

compose() {
  docker compose --project-directory "$ROOT" -f docker/docker-compose.yml "$@"
}

wait_langflow_health() {
  local url="${LANGFLOW_URL:-http://localhost:7860}"
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
    url="${LANGFLOW_URL:-http://localhost:7860}"
  fi
  url="${url%/}"
  local deadline=$((SECONDS + 90))
  echo "Waiting for Langflow at ${url}/health …"
  while (( SECONDS < deadline )); do
    if curl -sf "${url}/health" >/dev/null 2>&1; then
      echo "Langflow is healthy."
      return 0
    fi
    sleep 2
  done
  echo "Langflow did not become healthy within 90s. Check: docker compose logs" >&2
  return 1
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
  ensure_langflow_env_keys
  mkdir -p data/langflow output knowledge
  compose up -d
  wait_langflow_health
  echo "Langflow UI: http://localhost:7860"
  if [[ ! -f flows/flow_ids.json ]]; then
    echo "flow_ids.json missing — running bootstrap-flows …"
    cmd_bootstrap_flows
  else
    echo "flows/flow_ids.json present — skip bootstrap (run ./run.sh bootstrap-flows to re-sync)."
  fi
  echo "Ready."
}

cmd_server_stop() {
  compose down
}

cmd_bootstrap_flows() {
  ensure_ready
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
  python scripts/bootstrap_flows.py
}

cmd_generate_flows() {
  ensure_ready
  python -m app.flow_templates
}

run_app() {
  ensure_ready
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
  exec python -m app "$@"
}

run_serve() {
  ensure_ready
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
  shift
  exec python -m app.api "$@"
}

if [[ $# -eq 0 ]]; then
  run_app --interactive
elif [[ "$1" == "setup" ]]; then
  cmd_setup
elif [[ "$1" == "server" ]]; then
  cmd_server
elif [[ "$1" == "server-stop" ]]; then
  cmd_server_stop
elif [[ "$1" == "serve" ]]; then
  run_serve "$@"
elif [[ "$1" == "bootstrap-flows" ]]; then
  cmd_bootstrap_flows
elif [[ "$1" == "generate-flows" ]]; then
  cmd_generate_flows
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
else
  run_app "$@"
fi
