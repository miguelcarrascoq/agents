import { useEffect, useRef } from "react";
import mermaid from "mermaid";

let mermaidReady = false;

function ensureMermaid(): void {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
  });
  mermaidReady = true;
}

/** Strip HTML the LLM often puts in labels (<br/>, etc.) — breaks strict Mermaid. */
export function sanitizeMermaidSource(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

type Props = {
  html: string;
};

/** Renders markdown HTML and runs Mermaid on any `.mermaid` blocks. */
export function MarkdownArtifact({ html }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>(".mermaid");
    if (!nodes.length) return;

    for (const node of nodes) {
      // Skip already-rendered diagrams (contain SVG, no source text).
      if (node.querySelector("svg")) continue;
      const raw = node.textContent ?? "";
      const cleaned = sanitizeMermaidSource(raw);
      if (cleaned !== raw) node.textContent = cleaned;
    }

    ensureMermaid();
    void mermaid.run({
      nodes: Array.from(nodes).filter((n) => !n.querySelector("svg")),
      suppressErrors: true,
    });
  }, [html]);

  return (
    <div
      ref={ref}
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
