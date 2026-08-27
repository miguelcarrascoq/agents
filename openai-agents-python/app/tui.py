"""Launch interactive wizard for OpenAI Agents SDK lab."""

from __future__ import annotations

from feature_delivery_tui import run_interactive

from app.pipeline import run_feature_delivery


def main() -> int:
    return run_interactive(
        project_id="openai-agents-python",
        runner=run_feature_delivery,
        supports_quiet=False,
        cli_invocation="python -m app",
    )
