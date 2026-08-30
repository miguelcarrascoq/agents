"""HTTP API entrypoint for smolagents lab."""

from __future__ import annotations

from feature_delivery_api import serve

from app.pipeline import run_feature_delivery


def main() -> None:
    serve(
        project_id="smolagents-python",
        runner=run_feature_delivery,
        supports_quiet=True,
    )


if __name__ == "__main__":
    main()
