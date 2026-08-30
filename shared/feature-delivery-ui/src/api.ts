import type { RunFormState, RunResult } from "./types";

export type Health = { ok: boolean; project: string };

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/health");
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json() as Promise<Health>;
}

export async function createRun(form: RunFormState): Promise<RunResult> {
  const body: Record<string, unknown> = {
    request: form.request.trim(),
    provider: form.provider,
    agents: form.agents,
  };
  if (form.model.trim()) body.model = form.model.trim();
  if (form.runId.trim()) body.run_id = form.runId.trim();
  if (form.quiet) body.quiet = true;

  const res = await fetch("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as { detail: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : typeof data === "object" &&
            data !== null &&
            "message" in data &&
            typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data as RunResult;
}
