"""List previous run directories for resume."""

from __future__ import annotations

from pathlib import Path


def list_run_ids(output_dir: Path) -> list[str]:
    if not output_dir.is_dir():
        return []
    runs: list[tuple[float, str]] = []
    for child in output_dir.iterdir():
        if child.is_dir() and not child.name.startswith("."):
            try:
                mtime = child.stat().st_mtime
            except OSError:
                mtime = 0.0
            runs.append((mtime, child.name))
    runs.sort(reverse=True)
    return [run_id for _, run_id in runs]
