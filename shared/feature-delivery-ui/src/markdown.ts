import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

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
