"use strict";
/** Fix common LLM Mermaid mistakes that break the strict UI parser.
 *  Keep in sync with shared/feature-delivery-ui/src/mermaidSanitize.ts */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMermaidSource = sanitizeMermaidSource;
exports.sanitizeMermaidInMarkdown = sanitizeMermaidInMarkdown;
function neutralizeCommasInShapes(src) {
    return src
        .replace(/\[([^\]]*)]/g, (_, inner) => `[${inner.replace(/,/g, " /")}]`)
        .replace(/\(([^)]*)\)/g, (_, inner) => `(${inner.replace(/,/g, " /")})`)
        .replace(/\{([^}]*)}/g, (_, inner) => `{${inner.replace(/,/g, " /")}}`);
}
function neutralizeColonsInEdgeLabels(src) {
    return src
        .replace(/--\s*([^>\n]*?)\s*-->/g, (_, label) => `-- ${label.replace(/:/g, "-").trim()} -->`)
        .replace(/\|([^|\n]+)\|/g, (_, label) => `|${label.replace(/:/g, "-")}|`);
}
function neutralizeParensInEdgeLabels(src) {
    return src.replace(/--\s*([^>\n]*?)\s*-->/g, (_, label) => `-- ${label.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()} -->`);
}
function splitAmpersandChains(src) {
    return src
        .split("\n")
        .flatMap((line) => {
        const match = line.match(/^(\s*)(.+?)\s+&\s+(.+?)\s+-->\s+(.+)$/);
        if (!match)
            return [line];
        const [, indent, head, tail, target] = match;
        const parts = `${head} & ${tail}`.split("&").map((p) => p.trim()).filter(Boolean);
        return parts.map((part) => `${indent}${part} --> ${target}`);
    })
        .join("\n");
}
function baseClean(text) {
    return text
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/?[a-zA-Z][^>]*>/g, "")
        .replace(/"/g, "'")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
}
function sanitizeMermaidSource(text) {
    let src = baseClean(text);
    src = src.replace(/\[\(([^)\]]*)\)\]/g, "[$1]");
    src = src.replace(/\[([^\]]*)]/g, (_, inner) => `[${inner.replace(/\//g, " - ")}]`);
    src = neutralizeCommasInShapes(src);
    src = neutralizeColonsInEdgeLabels(src);
    src = neutralizeParensInEdgeLabels(src);
    src = splitAmpersandChains(src);
    return src.trim();
}
function sanitizeMermaidInMarkdown(text) {
    return text.replace(/```mermaid\s*\n([\s\S]*?)```/g, (_, body) => {
        return `\`\`\`mermaid\n${sanitizeMermaidSource(body)}\n\`\`\``;
    });
}
