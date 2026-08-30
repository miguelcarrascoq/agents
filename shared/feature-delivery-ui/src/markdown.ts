import { marked, type Tokens } from "marked";
import { highlightSource } from "./highlight";

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

marked.use({
  renderer: {
    code({ text, lang, escaped }: Tokens.Code): string {
      const language = (lang || "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (language === "mermaid") {
        const body = escaped ? text : escapeHtml(text);
        return `<div class="mermaid">${body}</div>\n`;
      }
      const { html, language: detected } = highlightSource(text, language);
      const cls = detected ? `hljs language-${detected}` : "hljs";
      return `<pre class="code-block"><code class="${cls}">${html}</code></pre>\n`;
    },
  },
});

/** Unwrap a single outer ``` / ```markdown fence if the whole doc is wrapped. */
export function unwrapMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1].trim() : trimmed;
}

export function renderMarkdown(text: string): string {
  const source = unwrapMarkdownFence(text);
  return marked.parse(source, { async: false }) as string;
}
