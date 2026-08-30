"""FastAPI factory wrapping run_feature_delivery."""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
import queue
import threading
import zipfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from feature_delivery_api.progress import bind_progress

Runner = Callable[..., Any]

_RUN_REQUEST_EXAMPLE = {
    "request": (
        "Genera una imagen divertida de Condorito tomando once en Pelotillehue con Yayita"
    ),
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "agents": ["researcher", "illustrator"],
}


class RunRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": _RUN_REQUEST_EXAMPLE})

    request: str = Field(..., min_length=1, description="Feature request in Spanish")
    provider: str | None = Field(None, description="openai | deepseek | openrouter")
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


def _ui_dist_dir() -> Path | None:
    """Resolve shared/feature-delivery-ui/dist if the UI has been built.

    Tries, in order:
    1. ``FEATURE_DELIVERY_UI_DIST`` (Docker / explicit override)
    2. Sibling of an editable ``feature-delivery-api`` checkout
       (``…/shared/feature-delivery-ui/dist``)
    3. Image layout ``/workspace/shared/feature-delivery-ui/dist``
    4. ``../shared/feature-delivery-ui/dist`` from the lab working directory
    """
    candidates: list[Path] = []
    env = os.environ.get("FEATURE_DELIVERY_UI_DIST")
    if env:
        candidates.append(Path(env))
    # Editable install: …/shared/feature-delivery-api/feature_delivery_api/app.py
    candidates.append(
        Path(__file__).resolve().parents[2] / "feature-delivery-ui" / "dist"
    )
    candidates.append(Path("/workspace/shared/feature-delivery-ui/dist"))
    candidates.append(Path.cwd() / ".." / "shared" / "feature-delivery-ui" / "dist")

    for candidate in candidates:
        resolved = candidate.resolve()
        if (resolved / "index.html").is_file():
            return resolved
    return None


def _runner_kwargs(body: RunRequest, *, supports_quiet: bool) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "provider": body.provider,
        "model": body.model,
        "run_id": body.run_id,
        "agents": body.agents,
    }
    if supports_quiet and body.quiet is not None:
        kwargs["quiet"] = body.quiet
    return kwargs


def _summarize(result: Any) -> dict[str, Any]:
    if hasattr(result, "to_summary") and callable(result.to_summary):
        return result.to_summary()
    if isinstance(result, dict):
        return result
    raise RuntimeError("Unexpected runner result type")


def _sse_format(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _wants_sse(request: Request) -> bool:
    accept = request.headers.get("accept", "")
    return "text/event-stream" in accept


def _safe_run_root(output_root: Path, run_id: str) -> Path:
    if not run_id or ".." in run_id or "/" in run_id or "\\" in run_id:
        raise HTTPException(status_code=400, detail="Invalid run_id")
    root = (output_root / run_id).resolve()
    if not root.is_dir():
        raise HTTPException(status_code=404, detail="Run output not found")
    return root


def _safe_run_file(output_root: Path, run_id: str, file_path: str) -> Path:
    root = _safe_run_root(output_root, run_id)
    target = (root / file_path).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return target


def _zip_run_directory(root: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                zf.write(path, arcname=path.relative_to(root).as_posix())
    return buf.getvalue()


def create_app(
    *,
    runner: Runner,
    project_id: str,
    supports_quiet: bool = False,
    output_root: Path | None = None,
) -> FastAPI:
    """Build a FastAPI app that exposes GET /health and POST /runs.

    Open access: no authentication on UI or API routes.
    """
    app = FastAPI(
        title=f"Feature Delivery — {project_id}",
        description=(
            "HTTP wrapper around `run_feature_delivery`. "
            "Open UI at `/`; Swagger at `/docs`. No authentication."
        ),
        version="0.1.0",
    )
    resolved_output = (
        output_root.resolve()
        if output_root is not None
        else (Path.cwd() / "output").resolve()
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "project": project_id}

    @app.get("/runs/{run_id}/files/{file_path:path}")
    def get_run_file(run_id: str, file_path: str) -> FileResponse:
        target = _safe_run_file(resolved_output, run_id, file_path)
        media_type, _ = mimetypes.guess_type(str(target))
        return FileResponse(target, media_type=media_type or "application/octet-stream")

    @app.get("/runs/{run_id}/zip")
    def get_run_zip(run_id: str) -> Response:
        root = _safe_run_root(resolved_output, run_id)
        payload = _zip_run_directory(root)
        return Response(
            content=payload,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{run_id}.zip"',
            },
        )

    @app.post("/runs")
    def create_run(body: RunRequest, request: Request) -> Any:
        kwargs = _runner_kwargs(body, supports_quiet=supports_quiet)

        if not _wants_sse(request):
            try:
                result = runner(body.request, **kwargs)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            try:
                return _summarize(result)
            except RuntimeError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc

        events: queue.Queue[tuple[str, dict[str, Any]] | None] = queue.Queue()

        def on_phase(payload: dict[str, Any]) -> None:
            events.put(("phase", payload))

        def worker() -> None:
            try:
                with bind_progress(on_phase):
                    result = runner(body.request, **kwargs)
                events.put(("done", _summarize(result)))
            except (ValueError, RuntimeError) as exc:
                events.put(("error", {"detail": str(exc)}))
            except Exception as exc:  # noqa: BLE001 — surface to client
                events.put(("error", {"detail": str(exc)}))
            finally:
                events.put(None)

        threading.Thread(target=worker, daemon=True).start()

        def event_stream() -> Iterator[str]:
            while True:
                item = events.get()
                if item is None:
                    break
                event, data = item
                yield _sse_format(event, data)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    ui_dist = _ui_dist_dir()
    if ui_dist is not None:
        index_html = ui_dist / "index.html"
        assets_dir = ui_dist / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="ui-assets")

        @app.get("/", include_in_schema=False)
        def ui_root() -> FileResponse:
            return FileResponse(index_html)
    else:

        @app.get("/", include_in_schema=False)
        def root_fallback() -> dict[str, str]:
            return {
                "message": "UI not built. Run: npm install && npm run build "
                "in shared/feature-delivery-ui — or open /docs",
                "docs": "/docs",
            }

    return app


def serve(
    *,
    runner: Runner,
    project_id: str,
    supports_quiet: bool = False,
    output_root: Path | None = None,
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
        output_root=output_root,
    )
    ui = _ui_dist_dir()
    if ui:
        print(f"UI:         http://{bind_host}:{bind_port}/")
    print(f"Swagger UI: http://{bind_host}:{bind_port}/docs")
    uvicorn.run(app, host=bind_host, port=bind_port)
