"""Interactive CLI wizard for feature-delivery labs (InquirerPy)."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from InquirerPy import inquirer
from InquirerPy.base.control import Choice

from feature_delivery_tui.agents import (
    AGENT_LABELS,
    AGENT_ORDER,
    DEFAULT_AGENTS,
    EXTENDED_AGENTS,
    agents_csv,
)
from feature_delivery_tui.runs import list_run_ids

Runner = Callable[..., Any]

# Esc and Ctrl+C both cancel the wizard cleanly (no alternate screen).
_CANCEL_KEYS = {
    "interrupt": [
        {"key": "c-c"},
        {"key": "escape"},
    ],
}


@dataclass
class TuiConfig:
    project_id: str
    runner: Runner
    supports_quiet: bool = False
    output_dir: Path = Path("output")
    cli_invocation: str = "python -m app"


def _build_cli_preview(
    config: TuiConfig,
    *,
    request: str,
    provider: str,
    model: str | None,
    run_id: str | None,
    agents: str,
    quiet: bool,
) -> str:
    snippet = request if len(request) <= 60 else f"{request[:60]}..."
    parts = [config.cli_invocation, f'"{snippet}"', f"--provider {provider}"]
    if model:
        parts.append(f"--model {model}")
    if run_id:
        parts.append(f"--run-id {run_id}")
    if agents:
        parts.append(f"--agents {agents}")
    if quiet:
        parts.append("--quiet")
    return " ".join(parts)


def run_interactive(
    *,
    project_id: str,
    runner: Runner,
    supports_quiet: bool = False,
    output_dir: Path | str = "output",
    cli_invocation: str = "python -m app",
) -> int:
    """Launch the interactive wizard; returns process exit code."""
    config = TuiConfig(
        project_id=project_id,
        runner=runner,
        supports_quiet=supports_quiet,
        output_dir=Path(output_dir),
        cli_invocation=cli_invocation,
    )

    print(f"\n{config.project_id} — feature delivery pipeline (interactive)")
    print("  ↑↓ move · Space toggle · Enter confirm · Esc cancel\n")

    try:
        request = inquirer.text(
            message="Feature request (español):",
            validate=lambda v: bool(str(v).strip()) or "Required",
            amark="✓",
            keybindings=_CANCEL_KEYS,
        ).execute()
        request = str(request).strip()

        default_provider = os.environ.get("LLM_PROVIDER", "openai")
        if default_provider not in ("openai", "deepseek"):
            default_provider = "openai"

        provider = inquirer.select(
            message="Provider:",
            choices=["openai", "deepseek"],
            default=default_provider,
            amark="✓",
            keybindings=_CANCEL_KEYS,
        ).execute()

        model_raw = inquirer.text(
            message="Model (optional, Enter to skip):",
            default="",
            amark="✓",
            keybindings=_CANCEL_KEYS,
        ).execute()
        model = str(model_raw).strip() or None

        recent = list_run_ids(config.output_dir)
        run_id: str | None = None
        if recent:
            run_choices: list[Choice | str] = [
                Choice(value="", name="Auto (new run)"),
                *[Choice(value=rid, name=rid) for rid in recent[:12]],
                Choice(value="__custom__", name="Custom…"),
            ]
            picked = inquirer.select(
                message="Run ID (resume sandbox):",
                choices=run_choices,
                default="",
                amark="✓",
                keybindings=_CANCEL_KEYS,
            ).execute()
            if picked == "__custom__":
                custom = inquirer.text(
                    message="Custom run ID:",
                    default="",
                    amark="✓",
                    keybindings=_CANCEL_KEYS,
                ).execute()
                run_id = str(custom).strip() or None
            else:
                run_id = str(picked).strip() or None
        else:
            custom = inquirer.text(
                message="Run ID (optional, Enter to skip):",
                default="",
                amark="✓",
                keybindings=_CANCEL_KEYS,
            ).execute()
            run_id = str(custom).strip() or None

        preset = inquirer.select(
            message="Agent preset:",
            choices=[
                Choice(
                    value="default",
                    name="Default (planner, designer, coder, reviewer)",
                ),
                Choice(
                    value="extended",
                    name="Extended (all agents, incl. research + diagrams)",
                ),
                Choice(value="custom", name="Custom selection"),
            ],
            default="default",
            amark="✓",
            keybindings=_CANCEL_KEYS,
        ).execute()

        if preset == "default":
            selected: list[str] = list(DEFAULT_AGENTS)
        elif preset == "extended":
            selected = list(EXTENDED_AGENTS)
        else:
            selected = list(
                inquirer.checkbox(
                    message="Agents (Space toggle, Enter confirm):",
                    choices=[
                        Choice(
                            value=agent,
                            name=AGENT_LABELS[agent],
                            enabled=agent in DEFAULT_AGENTS,
                        )
                        for agent in AGENT_ORDER
                    ],
                    validate=lambda result: bool(result) or "Select at least one agent",
                    amark="✓",
                    keybindings=_CANCEL_KEYS,
                ).execute()
            )

        selected_ordered = [a for a in AGENT_ORDER if a in selected]
        agents = agents_csv(selected_ordered)

        quiet = False
        if config.supports_quiet:
            quiet = bool(
                inquirer.confirm(
                    message="Quiet mode (suppress smolagents Step output)?",
                    default=False,
                    amark="✓",
                    keybindings=_CANCEL_KEYS,
                ).execute()
            )

        preview = _build_cli_preview(
            config,
            request=request,
            provider=str(provider),
            model=model,
            run_id=run_id,
            agents=agents,
            quiet=quiet,
        )
        print(f"\nCLI preview:\n  {preview}\n")

        confirmed = inquirer.confirm(
            message="Run pipeline?",
            default=True,
            amark="✓",
            keybindings=_CANCEL_KEYS,
        ).execute()
        if not confirmed:
            print("Cancelled.")
            return 0

        print("\nRunning pipeline…\n")
        kwargs: dict[str, Any] = {
            "provider": str(provider),
            "model": model,
            "run_id": run_id,
            "agents": agents,
        }
        if config.supports_quiet:
            kwargs["quiet"] = quiet

        result = config.runner(request, **kwargs)
        if hasattr(result, "format_location_report"):
            print(result.format_location_report())
        else:
            print(
                f"\nResults saved to:\n  {result.output_dir}\n"
                f"run_id: {result.run_id}\n"
            )
        print(f"provider={result.provider} model={result.model}")
        return 0

    except KeyboardInterrupt:
        print("\nCancelled.")
        return 0
    except EOFError:
        print("\nCancelled.")
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}")
        return 1


__all__ = ["run_interactive", "TuiConfig"]
