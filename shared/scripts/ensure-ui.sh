# Shared helper: build feature-delivery-ui if dist/ is missing.
# Source from a lab:  source ../shared/scripts/ensure-ui.sh

ensure_feature_delivery_ui() {
  local script_dir ui_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ui_root="$(cd "${script_dir}/../feature-delivery-ui" && pwd)"

  if [[ -f "${ui_root}/dist/index.html" ]]; then
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "UI not built and npm not found. Install Node.js, then:" >&2
    echo "  cd ${ui_root} && npm install && npm run build" >&2
    return 1
  fi

  echo "Building shared Feature Delivery UI…"
  (
    cd "${ui_root}"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    npm run build
  )
}
