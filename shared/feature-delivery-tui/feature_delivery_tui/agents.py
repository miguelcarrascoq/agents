"""Agent names, order, and presets shared across labs."""

from __future__ import annotations

AGENT_ORDER: tuple[str, ...] = (
    "researcher",
    "planner",
    "designer",
    "diagrammer",
    "illustrator",
    "coder",
    "reviewer",
)

DEFAULT_AGENTS: frozenset[str] = frozenset(
    {"planner", "designer", "coder", "reviewer"}
)

EXTENDED_AGENTS: tuple[str, ...] = AGENT_ORDER

AGENT_LABELS: dict[str, str] = {
    "researcher": "Researcher — web search",
    "planner": "Planner — plan.md",
    "designer": "Designer — design.md",
    "diagrammer": "Diagrammer — Mermaid diagrams",
    "illustrator": "Illustrator — PNG assets",
    "coder": "Coder — src/**",
    "reviewer": "Reviewer — review.md",
}


def agents_csv(selected: list[str]) -> str:
    ordered = [a for a in AGENT_ORDER if a in selected]
    return ",".join(ordered)


def parse_agents_csv(value: str) -> list[str]:
    parts = [p.strip() for p in value.replace(",", " ").split() if p.strip()]
    return [a for a in AGENT_ORDER if a in parts]
