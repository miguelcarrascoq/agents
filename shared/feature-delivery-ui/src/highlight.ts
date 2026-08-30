import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

import "highlight.js/styles/github.css";

let registered = false;

function ensureHljs(): void {
  if (registered) return;
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("sh", bash);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("md", markdown);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("tsx", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("yml", yaml);
  registered = true;
}

const EXT_LANG: Record<string, string> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".sh": "bash",
  ".bash": "bash",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".css": "css",
  ".html": "xml",
  ".xml": "xml",
  ".sql": "sql",
};

export function langFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return EXT_LANG[base.slice(dot).toLowerCase()] ?? "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Highlight source; returns inner HTML for a `<code>` element. */
export function highlightSource(code: string, langHint = ""): {
  html: string;
  language: string;
} {
  ensureHljs();
  const hint = langHint.trim().toLowerCase().split(/[^a-z0-9+#-]/)[0] ?? "";
  try {
    if (hint && hljs.getLanguage(hint)) {
      const result = hljs.highlight(code, { language: hint, ignoreIllegals: true });
      return { html: result.value, language: result.language ?? hint };
    }
    const result = hljs.highlightAuto(code);
    return { html: result.value, language: result.language ?? "" };
  } catch {
    return { html: escapeHtml(code), language: hint };
  }
}

export function highlightToPre(code: string, langHint = ""): string {
  const { html, language } = highlightSource(code, langHint);
  const cls = language ? `hljs language-${language}` : "hljs";
  return `<pre class="code-block"><code class="${cls}">${html}</code></pre>`;
}
