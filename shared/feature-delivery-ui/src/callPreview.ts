import { runBody } from "./api";
import type { RunFormState } from "./types";

function cliInvocation(project: string | null): string {
  if (project?.endsWith("-typescript")) return "npm start --";
  return "python -m app";
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
  const header = project ? `# ${project}\n` : "";
  return (
    `${header}` +
    `./run.sh "${snippet}" ${flags}\n` +
    `${native} "${snippet}" ${flags}`
  );
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
