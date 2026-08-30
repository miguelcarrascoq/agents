import { useEffect, useRef } from "react";
import mermaid from "mermaid";

let mermaidReady = false;
let renderSeq = 0;

function ensureMermaid(): void {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
  });
  mermaidReady = true;
}

/** Fix common LLM Mermaid mistakes that break the parser (strict mode). */
export function sanitizeMermaidSource(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    // Double quotes inside labels/edges → single quotes (parser error otherwise).
    .replace(/"/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

type Props = {
  html: string;
};

async function paintMermaid(root: HTMLElement, signal: { cancelled: boolean }) {
  ensureMermaid();
  const nodes = root.querySelectorAll<HTMLElement>(".mermaid");
  for (const node of nodes) {
    if (signal.cancelled) return;
    if (node.querySelector("svg")) continue;

    const raw = sanitizeMermaidSource(node.textContent ?? "");
    if (!raw) continue;

    try {
      const id = `mmd-${++renderSeq}`;
      const { svg } = await mermaid.render(id, raw);
      if (signal.cancelled) return;
      node.innerHTML = svg;
    } catch {
      if (signal.cancelled) return;
      // Keep source readable if parse fails (div whitespace would otherwise collapse).
      node.textContent = raw;
      node.dataset.mermaidError = "1";
    }
  }
}

/** Renders markdown HTML and paints Mermaid diagrams as SVG. */
export function MarkdownArtifact({ html }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const signal = { cancelled: false };
    void paintMermaid(root, signal);

    const details = root.closest("details");
    const onToggle = () => {
      if (!details?.open) return;
      void paintMermaid(root, signal);
    };
    details?.addEventListener("toggle", onToggle);

    return () => {
      signal.cancelled = true;
      details?.removeEventListener("toggle", onToggle);
    };
  }, [html]);

  return (
    <div
      ref={ref}
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
