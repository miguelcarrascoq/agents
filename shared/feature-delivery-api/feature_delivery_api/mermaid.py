"""Shared Mermaid prompt rules and sanitization for feature-delivery pipelines."""

from __future__ import annotations

import re

MERMAID_FLOWCHART_RULES = (
    "REGLAS OBLIGATORIAS para diagramas Mermaid flowchart (la UI usa parser estricto):\n"
    "- Empezar con flowchart TD o flowchart LR.\n"
    "- Preferir una arista por línea: ID[Etiqueta] --> OtroID[Otra etiqueta]. "
    "No declares nodos y aristas en bloques separados.\n"
    "- IDs CamelCase sin espacios; etiqueta visible entre corchetes.\n"
    "- Etiquetas cortas en texto plano: sin HTML, sin <br>, sin comillas dobles.\n"
    "- Sin / en etiquetas (usar espacio o guion).\n"
    "- Sin comas en etiquetas de nodos.\n"
    "- Sin : en etiquetas de aristas (M-N en lugar de M:N).\n"
    "- Sin paréntesis en etiquetas de aristas (GET index en lugar de GET (index)).\n"
    "- Solo rectángulos [...] y rombos {...}; no [(cilindro)], [[subrutina]] ni ((círculo)).\n"
    "- No uses A & B --> C; una arista por línea.\n"
    "- Sin acentos en etiquetas si es posible.\n"
    "- PROHIBIDO: ASCII art, sequenceDiagram, classDiagram."
)

MERMAID_DESIGNER_RULES = (
    " Eres el Designer/Architect. Produce design.md en markdown con: "
    "componentes, APIs (endpoints), modelo de datos, trade-offs y un diagrama de "
    "componentes. OBLIGATORIO: el diagrama debe ir en un fence ```mermaid. "
    f"{MERMAID_FLOWCHART_RULES} "
    "PROHIBIDO además diagramas ASCII/textual."
)

MERMAID_DIAGRAMMER_ARCH_RULES = (
    " Eres el Diagrammer. Genera SOLO código Mermaid válido para un diagrama de "
    "arquitectura (componentes y dependencias). Debe empezar con flowchart TD, "
    f"flowchart LR o graph TD. {MERMAID_FLOWCHART_RULES} Sin markdown ni explicaciones."
)

MERMAID_DIAGRAMMER_SEQ_RULES = (
    " Eres el Diagrammer. Genera SOLO código Mermaid válido para un flujo temporal "
    "(pasos / secuencia de interacción). Usa flowchart TD o flowchart LR. "
    "Máximo ~15 nodos; evita ramas excesivas. "
    f"{MERMAID_FLOWCHART_RULES} Sin markdown ni explicaciones."
)


def _neutralize_commas_in_shapes(src: str) -> str:
    src = re.sub(
        r"\[([^\]]*)]",
        lambda m: f"[{m.group(1).replace(',', ' /')}]",
        src,
    )
    src = re.sub(
        r"\(([^)]*)\)",
        lambda m: f"({m.group(1).replace(',', ' /')})",
        src,
    )
    src = re.sub(
        r"\{([^}]*)}",
        lambda m: f"{{{m.group(1).replace(',', ' /')}}}",
        src,
    )
    return src


def _neutralize_colons_in_edge_labels(src: str) -> str:
    src = re.sub(
        r"--\s*([^>\n]*?)\s*-->",
        lambda m: f"-- {m.group(1).replace(':', '-').strip()} -->",
        src,
    )
    src = re.sub(
        r"\|([^|\n]+)\|",
        lambda m: f"|{m.group(1).replace(':', '-')}|",
        src,
    )
    return src


def _neutralize_parens_in_edge_labels(src: str) -> str:
    return re.sub(
        r"--\s*([^>\n]*?)\s*-->",
        lambda m: f"-- {re.sub(r'[()]', ' ', m.group(1)).strip()} -->",
        src,
    )


def _split_ampersand_chains(src: str) -> str:
    """Expand `A & B --> C` into separate edges (strict parser may reject & chains)."""
    lines: list[str] = []
    for line in src.splitlines():
        match = re.match(r"^(\s*)(.+?)\s+&\s+(.+?)\s+-->\s+(.+)$", line)
        if not match:
            lines.append(line)
            continue
        indent, head, tail, target = match.groups()
        parts = [p.strip() for p in f"{head} & {tail}".split("&")]
        for part in parts:
            if part:
                lines.append(f"{indent}{part} --> {target}")
    return "\n".join(lines)


def sanitize_mermaid_in_markdown(text: str) -> str:
    """Sanitize every ```mermaid fence inside a markdown document."""

    def repl(match: re.Match[str]) -> str:
        body = sanitize_mermaid_source(match.group(1))
        return f"```mermaid\n{body}\n```"

    return re.sub(r"```mermaid\s*\n([\s\S]*?)```", repl, text)


def sanitize_mermaid_source(text: str) -> str:
    """Fix common LLM Mermaid mistakes that break the strict UI parser."""
    src = text.strip()
    src = re.sub(r"<br\s*/?>", " ", src, flags=re.IGNORECASE)
    src = re.sub(r"</?[a-zA-Z][^>]*>", "", src)
    src = src.replace('"', "'")
    src = re.sub(r"[ \t]+\n", "\n", src)
    # Cylinder [(label)] → rectangle [label] before other paren handling.
    src = re.sub(r"\[\(([^)\]]*)\)\]", r"[\1]", src)
    src = re.sub(
        r"\[([^\]]*)\]",
        lambda m: f"[{m.group(1).replace('/', ' - ')}]",
        src,
    )
    src = _neutralize_commas_in_shapes(src)
    src = _neutralize_colons_in_edge_labels(src)
    src = _neutralize_parens_in_edge_labels(src)
    src = _split_ampersand_chains(src)
    return src.strip()
