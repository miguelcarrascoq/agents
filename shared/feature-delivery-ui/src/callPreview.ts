import { createElement, type ReactNode } from "react";
import { runBody } from "./api";
import type { RunFormState } from "./types";

function cliInvocation(project: string | null): string {
  if (project?.endsWith("-typescript")) return "npm start --";
  return "python -m app";
}

function nativeEntryLabel(project: string | null): string {
  if (project?.endsWith("-typescript")) return "npm start -- (entry nativo)";
  return "python -m app (entry nativo)";
}

function requestSnippet(request: string): string {
  const trimmed = request.trim();
  if (!trimmed) return "…";
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}...` : trimmed;
}

function cliFlags(form: RunFormState, supportsQuiet: boolean): string[] {
  const parts = [`--provider ${form.provider}`];
  if (form.model.trim()) parts.push(`--model ${form.model.trim()}`);
  if (form.runId.trim()) parts.push(`--run-id ${form.runId.trim()}`);
  if (form.agents.length) parts.push(`--agents ${form.agents.join(",")}`);
  if (supportsQuiet && form.quiet) parts.push("--quiet");
  return parts;
}

/** CLI one-shot preview (run.sh + language-native entry). */
export function buildCliPreview(
  form: RunFormState,
  project: string | null,
  supportsQuiet: boolean,
): string {
  const snippet = requestSnippet(form.request);
  const flags = cliFlags(form, supportsQuiet).join(" ");
  const native = cliInvocation(project);
  const lines: string[] = [];
  if (project) lines.push(`# ${project}`, "");
  lines.push(
    "# Via run.sh (Docker / lab entrypoint)",
    `./run.sh "${snippet}" ${flags}`,
    "",
    `# Via ${nativeEntryLabel(project)}`,
    `${native} "${snippet}" ${flags}`,
  );
  return lines.join("\n");
}

/** curl POST /runs (SSE, same contract as the web UI). */
export function buildApiPreview(form: RunFormState): string {
  const body = JSON.stringify(runBody(form), null, 2);
  return (
    `curl -N -X POST http://127.0.0.1:8000/runs \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -H 'Accept: text/event-stream' \\\n` +
    `  -d '${body.replace(/'/g, `'\\''`)}'\n` +
    `\n# Sin Accept: text/event-stream responde JSON de una vez.`
  );
}

type TokKind =
  | "comment"
  | "string"
  | "flag"
  | "cmd"
  | "key"
  | "punct"
  | "plain";

function tok(kind: TokKind, text: string, key: number): ReactNode {
  if (kind === "plain") return text;
  return createElement("span", { key, className: `tok-${kind}` }, text);
}

const CMD_RE =
  /^(curl|\.\/run\.sh|python|npm|node|npx|docker|pip|uv|poetry)\b/;

function highlightShellLine(line: string, keyBase: number): ReactNode[] {
  if (line.startsWith("#")) {
    return [tok("comment", line, keyBase)];
  }

  const nodes: ReactNode[] = [];
  let i = 0;
  let k = keyBase;
  let atLineStart = true;

  while (i < line.length) {
    const rest = line.slice(i);

    if (rest[0] === "#" && (i === 0 || /\s/.test(line[i - 1] ?? ""))) {
      nodes.push(tok("comment", rest, k++));
      break;
    }

    if (rest[0] === '"' || rest[0] === "'") {
      const jsonKey = rest.match(/^"([^"\\]|\\.)*"(\s*):/);
      if (jsonKey && rest[0] === '"') {
        const full = jsonKey[0];
        const colonIdx = full.lastIndexOf(":");
        const keyPart = full.slice(0, colonIdx).trimEnd();
        const gap = full.slice(keyPart.length, colonIdx);
        nodes.push(tok("key", keyPart, k++));
        if (gap) nodes.push(gap);
        nodes.push(tok("punct", ":", k++));
        i += full.length;
        atLineStart = false;
        continue;
      }

      const q = rest[0];
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\" && j + 1 < rest.length) {
          j += 2;
          continue;
        }
        if (rest[j] === q) {
          j += 1;
          break;
        }
        j += 1;
      }
      nodes.push(tok("string", rest.slice(0, j), k++));
      i += j;
      atLineStart = false;
      continue;
    }

    if (atLineStart || (i > 0 && /\s/.test(line[i - 1] ?? ""))) {
      const cmd = rest.match(CMD_RE);
      if (cmd) {
        nodes.push(tok("cmd", cmd[0], k++));
        i += cmd[0].length;
        atLineStart = false;
        continue;
      }
    }

    const flag = rest.match(/^--?[\w-]+/);
    if (flag && (i === 0 || /\s/.test(line[i - 1] ?? ""))) {
      nodes.push(tok("flag", flag[0], k++));
      i += flag[0].length;
      atLineStart = false;
      continue;
    }

    if (/^[{}\[\]:,\\]/.test(rest[0]!)) {
      nodes.push(tok("punct", rest[0]!, k++));
      i += 1;
      atLineStart = false;
      continue;
    }

    const plain = rest.match(/^[^\s"'#\\{}\[\]:,-]+/) ?? rest.match(/^\s+/);
    if (plain) {
      nodes.push(plain[0]);
      i += plain[0].length;
      if (!/^\s+$/.test(plain[0])) atLineStart = false;
      continue;
    }

    nodes.push(rest[0]!);
    i += 1;
    atLineStart = false;
  }

  return nodes;
}

/** Lightweight shell/curl token highlight for the call preview. */
export function highlightCallPreview(code: string): ReactNode[] {
  const lines = code.split("\n");
  const out: ReactNode[] = [];
  lines.forEach((line, idx) => {
    out.push(...highlightShellLine(line, idx * 1000));
    if (idx < lines.length - 1) out.push("\n");
  });
  return out;
}
