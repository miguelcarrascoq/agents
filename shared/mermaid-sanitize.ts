/** Fix common LLM Mermaid mistakes that break the strict UI parser.
 *  Keep in sync with shared/feature-delivery-ui/src/mermaidSanitize.ts */

function neutralizeCommasInShapes(src: string): string {
  return src
    .replace(/\[([^\]]*)]/g, (_, inner: string) => `[${inner.replace(/,/g, " /")}]`)
    .replace(/\(([^)]*)\)/g, (_, inner: string) => `(${inner.replace(/,/g, " /")})`)
    .replace(/\{([^}]*)}/g, (_, inner: string) => `{${inner.replace(/,/g, " /")}}`);
}

function neutralizeColonsInEdgeLabels(src: string): string {
  return src
    .replace(/--\s*([^>\n]*?)\s*-->/g, (_, label: string) => `-- ${label.replace(/:/g, "-").trim()} -->`)
    .replace(/\|([^|\n]+)\|/g, (_, label: string) => `|${label.replace(/:/g, "-")}|`);
}

function neutralizeParensInEdgeLabels(src: string): string {
  return src.replace(/--\s*([^>\n]*?)\s*-->/g, (_, label: string) =>
    `-- ${label.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()} -->`,
  );
}

function splitAmpersandChains(src: string): string {
  return src
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^(\s*)(.+?)\s+&\s+(.+?)\s+-->\s+(.+)$/);
      if (!match) return [line];
      const [, indent, head, tail, target] = match;
      const parts = `${head} & ${tail}`.split("&").map((p) => p.trim()).filter(Boolean);
      return parts.map((part) => `${indent}${part} --> ${target}`);
    })
    .join("\n");
}

function baseClean(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/"/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function sanitizeMermaidSource(text: string): string {
  let src = baseClean(text);
  src = src.replace(/\[\(([^)\]]*)\)\]/g, "[$1]");
  src = src.replace(/\[([^\]]*)]/g, (_, inner: string) => `[${inner.replace(/\//g, " - ")}]`);
  src = neutralizeCommasInShapes(src);
  src = neutralizeColonsInEdgeLabels(src);
  src = neutralizeParensInEdgeLabels(src);
  src = splitAmpersandChains(src);
  return src.trim();
}

export function sanitizeMermaidInMarkdown(text: string): string {
  return text.replace(/```mermaid\s*\n([\s\S]*?)```/g, (_, body: string) => {
    return `\`\`\`mermaid\n${sanitizeMermaidSource(body)}\n\`\`\``;
  });
}
