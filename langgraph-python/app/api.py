"""HTTP API entrypoint for LangGraph lab."""

from __future__ import annotations

from feature_delivery_api import serve

from app.pipeline import run_feature_delivery


def main() -> None:
    serve(
        project_id="langgraph-python",
        runner=run_feature_delivery,
        supports_quiet=False,
    )


if __name__ == "__main__":
    main()
