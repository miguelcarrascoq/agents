"""Optional phase-progress callback for HTTP streaming (ContextVar)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

PhaseCallback = Callable[[dict[str, Any]], None]

_phase_callback: ContextVar[PhaseCallback | None] = ContextVar(
    "feature_delivery_phase_callback",
    default=None,
)


def emit_phase(
    phase: str,
    index: int,
    total: int,
    run_id: str,
    framework: str,
) -> None:
    """Notify the current progress listener, if any (no-op for CLI/TUI)."""
    callback = _phase_callback.get()
    if callback is None:
        return
    callback(
        {
            "phase": phase,
            "index": index,
            "total": total,
            "run_id": run_id,
            "framework": framework,
        }
    )


@contextmanager
def bind_progress(callback: PhaseCallback) -> Iterator[None]:
    """Bind a phase callback for the current context (set inside the runner thread)."""
    token = _phase_callback.set(callback)
    try:
        yield
    finally:
        _phase_callback.reset(token)
