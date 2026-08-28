"""Launch interactive wizard for Langflow lab."""

from __future__ import annotations

from feature_delivery_tui import run_interactive

from app.pipeline import run_feature_delivery


def main() -> int:
    return run_interactive(
        project_id="langflow-python",
        runner=run_feature_delivery,
        supports_quiet=False,
        cli_invocation="python -m app",
    )
