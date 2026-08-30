"""HTTP API entrypoint for OpenAI Agents lab."""

from __future__ import annotations

from pathlib import Path

from feature_delivery_api import serve

from app.pipeline import run_feature_delivery

_OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output"


def main() -> None:
    serve(
        project_id="openai-agents-python",
        runner=run_feature_delivery,
        supports_quiet=False,
        output_root=_OUTPUT_ROOT,
    )


if __name__ == "__main__":
    main()
