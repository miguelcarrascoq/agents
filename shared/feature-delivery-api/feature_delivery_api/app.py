"""FastAPI factory wrapping run_feature_delivery."""

from __future__ import annotations

import argparse
import os
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

Runner = Callable[..., Any]


class RunRequest(BaseModel):
    request: str = Field(..., min_length=1, description="Feature request in Spanish")
    provider: str | None = Field(None, description="openai | deepseek")
    model: str | None = None
    run_id: str | None = Field(None, description="Resume from an existing sandbox run")
    agents: str | list[str] | None = Field(
        None,
        description="CSV string or list of agent names",
    )
    quiet: bool | None = Field(
        None,
        description="Suppress verbose agent step output (smolagents only)",
    )


def create_app(
    *,
    runner: Runner,
    project_id: str,
    supports_quiet: bool = False,
) -> FastAPI:
    """Build a FastAPI app that exposes GET /health and POST /runs."""
    app = FastAPI(
        title=f"Feature Delivery — {project_id}",
        description=(
            "HTTP wrapper around `run_feature_delivery`. "
            "Interactive docs: `/docs` (Swagger) and `/redoc`."
        ),
        version="0.1.0",
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "project": project_id}

    @app.post("/runs")
    def create_run(body: RunRequest) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "provider": body.provider,
            "model": body.model,
            "run_id": body.run_id,
            "agents": body.agents,
        }
        if supports_quiet and body.quiet is not None:
            kwargs["quiet"] = body.quiet
        try:
            result = runner(body.request, **kwargs)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if hasattr(result, "to_summary") and callable(result.to_summary):
            return result.to_summary()
        if isinstance(result, dict):
            return result
        raise HTTPException(status_code=500, detail="Unexpected runner result type")

    return app


def serve(
    *,
    runner: Runner,
    project_id: str,
    supports_quiet: bool = False,
    host: str | None = None,
    port: int | None = None,
) -> None:
    """Parse host/port from argv/env and run uvicorn."""
    parser = argparse.ArgumentParser(description=f"HTTP API for {project_id}")
    parser.add_argument(
        "--host",
        default=os.environ.get("HOST", "127.0.0.1"),
        help="Bind host (default: 127.0.0.1 or $HOST)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8000")),
        help="Bind port (default: 8000 or $PORT)",
    )
    args = parser.parse_args()
    bind_host = host if host is not None else args.host
    bind_port = port if port is not None else args.port

    import uvicorn

    app = create_app(
        runner=runner,
        project_id=project_id,
        supports_quiet=supports_quiet,
    )
    print(f"Swagger UI: http://{bind_host}:{bind_port}/docs")
    uvicorn.run(app, host=bind_host, port=bind_port)
