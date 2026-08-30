"""HTTP API entrypoint for Langflow lab (lab wrapper, not Langflow Docker)."""

from __future__ import annotations

from feature_delivery_api import serve

from app.pipeline import run_feature_delivery


def main() -> None:
    serve(
        project_id="langflow-python",
        runner=run_feature_delivery,
        supports_quiet=False,
    )


if __name__ == "__main__":
    main()
