"""CLI entrypoint: thin wrapper over run_feature_delivery."""

from __future__ import annotations

import argparse
import sys

from app.pipeline import run_feature_delivery


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Feature delivery multi-agent pipeline (LangGraph)."
    )
    parser.add_argument(
        "request",
        nargs="?",
        default=None,
        help="Feature request in Spanish",
    )
    parser.add_argument(
        "-i",
        "--interactive",
        action="store_true",
        help="Launch interactive wizard (default when request is omitted)",
    )
    parser.add_argument(
        "--provider",
        choices=["openai", "deepseek"],
        default=None,
        help="LLM provider (default: LLM_PROVIDER or openai)",
    )
    parser.add_argument("--model", default=None, help="Override model name")
    parser.add_argument("--run-id", default=None, help="Optional stable run id")
    parser.add_argument(
        "--agents",
        default=None,
        help=(
            "Comma or space separated agents: researcher, planner, designer, "
            "diagrammer, illustrator, coder, reviewer (default: planner,designer,coder,reviewer)"
        ),
    )
    args = parser.parse_args(argv)

    if args.interactive or args.request is None:
        from app.tui import main as tui_main

        return tui_main()

    try:
        result = run_feature_delivery(
            args.request,
            provider=args.provider,
            model=args.model,
            run_id=args.run_id,
            agents=args.agents,
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(result.format_location_report())
    print(f"provider={result.provider} model={result.model}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
