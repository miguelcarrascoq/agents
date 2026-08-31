import { useEffect, useLayoutEffect, useRef } from "react";
import mermaid from "mermaid";
import { sanitizeMermaidSource } from "./mermaidSanitize";

let mermaidReady = false;
let renderSeq = 0;
let renderChain: Promise<unknown> = Promise.resolve();

function ensureMermaid(): void {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
  });
  mermaidReady = true;
}

type Props = {
  html: string;
};

async function renderDiagram(id: string, source: string): Promise<string> {
  const { svg } = await mermaid.render(id, source);
  return svg;
}

async function paintMermaid(root: HTMLElement, generation: number, myGen: { value: number }) {
  ensureMermaid();
  const nodes = root.querySelectorAll<HTMLElement>(".mermaid");
  for (const node of nodes) {
    if (myGen.value !== generation) return;
    if (node.querySelector("svg")) continue;

    const raw = sanitizeMermaidSource(node.textContent ?? "");
    if (!raw) continue;

    const id = `mmd-${++renderSeq}`;
    try {
      const task = async () => renderDiagram(id, raw);
      const svg = await (renderChain = renderChain.then(task, task));
      if (myGen.value !== generation) return;
      node.innerHTML = svg;
      delete node.dataset.mermaidError;
    } catch {
      if (myGen.value !== generation) return;
      node.textContent = raw;
      node.dataset.mermaidError = "1";
    }
  }
}

/** Renders markdown HTML and paints Mermaid diagrams as SVG. */
export function MarkdownArtifact({ html }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const htmlRef = useRef("");
  const generationRef = useRef(0);

  // Only write innerHTML when markdown changes. Using dangerouslySetInnerHTML on
  // every parent re-render would wipe imperative Mermaid SVG updates.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || htmlRef.current === html) return;
    root.innerHTML = html;
    htmlRef.current = html;
  }, [html]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const myGen = { value: ++generationRef.current };
    const generation = myGen.value;
    void paintMermaid(root, generation, myGen);

    const details = root.closest("details");
    const onToggle = () => {
      if (!details?.open) return;
      void paintMermaid(root, generation, myGen);
    };
    details?.addEventListener("toggle", onToggle);

    return () => {
      myGen.value = -1;
      details?.removeEventListener("toggle", onToggle);
    };
  }, [html]);

  return <div ref={ref} className="md" />;
}

// Re-export for tests or tooling that import from this module.
export { sanitizeMermaidSource, sanitizeMermaidInMarkdown } from "./mermaidSanitize";
