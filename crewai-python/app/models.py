"""Shared result types for the feature-delivery pipeline."""

from __future__ import annotations

import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class RunResult:
    run_id: str
    output_dir: str
    request: str
    plan: str = ""
    design: str = ""
    review: str = ""
    research: str = ""
    files: list[str] = field(default_factory=list)
    diagrams: list[str] = field(default_factory=list)
    assets: list[str] = field(default_factory=list)
    provider: str = ""
    model: str = ""

    def to_summary(self) -> dict[str, Any]:
        return asdict(self)

    def write_summary(self) -> Path:
        import json

        path = Path(self.output_dir) / "summary.json"
        path.write_text(json.dumps(self.to_summary(), ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def format_location_report(self) -> str:
        """Human-readable report of where artifacts were written."""
        out = Path(self.output_dir).resolve()
        diagrams = self.diagrams or [
            f for f in self.files if f.startswith("diagrams/") or f.endswith(".mmd")
        ]
        assets = self.assets or [f for f in self.files if f.startswith("assets/")]
        lines = [
            "",
            "═" * 40,
            "Results saved to:",
            f"  {out}",
            f"run_id: {self.run_id}",
        ]
        if diagrams:
            lines.append("Diagrams:")
            for rel in diagrams:
                lines.append(f"  {out / rel}")
        if assets:
            lines.append("Assets:")
            for rel in assets:
                lines.append(f"  {out / rel}")
        if self.files:
            lines.append(f"Files ({len(self.files)}):")
            for rel in self.files[:25]:
                lines.append(f"  {rel}")
            if len(self.files) > 25:
                lines.append(f"  … and {len(self.files) - 25} more")
        lines.extend(["═" * 40, ""])
        return "\n".join(lines)

    def announce(self) -> None:
        """Print where results were saved (stderr — visible alongside phase banners)."""
        sys.stderr.write(self.format_location_report())
        sys.stderr.flush()
