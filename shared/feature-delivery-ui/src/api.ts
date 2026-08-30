import type { RunFormState, RunResult } from "./types";

export type Health = { ok: boolean; project: string };

export type PhaseEvent = {
  phase: string;
  index: number;
  total: number;
  run_id: string;
  framework: string;
};

export type CreateRunHandlers = {
  onPhase?: (event: PhaseEvent) => void;
};

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/health");
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json() as Promise<Health>;
}

export function runBody(form: RunFormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    request: form.request.trim(),
    provider: form.provider,
    agents: form.agents,
  };
  if (form.model.trim()) body.model = form.model.trim();
  if (form.runId.trim()) body.run_id = form.runId.trim();
  if (form.quiet) body.quiet = true;
  return body;
}

function errorFromPayload(data: unknown, status: number): Error {
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
        : `Request failed (${status})`;
  return new Error(detail);
}

/** Parse one SSE block (`event:` + `data:`) from a buffer chunk. */
function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

async function createRunSse(
  form: RunFormState,
  handlers: CreateRunHandlers = {},
): Promise<RunResult> {
  const res = await fetch("/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(runBody(form)),
  });

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw errorFromPayload(data, res.status);
  }

  if (!res.body) {
    throw new Error("Streaming response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RunResult | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      const parsed = parseSseBlock(block.trim());
      if (!parsed) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(parsed.data);
      } catch {
        continue;
      }
      if (parsed.event === "phase" && payload && typeof payload === "object") {
        handlers.onPhase?.(payload as PhaseEvent);
      } else if (parsed.event === "done") {
        result = payload as RunResult;
      } else if (
        parsed.event === "error" &&
        payload &&
        typeof payload === "object" &&
        "detail" in payload
      ) {
        streamError = String((payload as { detail: unknown }).detail);
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("Stream ended without a result");
  return result;
}

async function createRunJson(form: RunFormState): Promise<RunResult> {
  const res = await fetch("/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(runBody(form)),
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw errorFromPayload(data, res.status);
  return data as RunResult;
}

export async function createRun(
  form: RunFormState,
  handlers: CreateRunHandlers = {},
): Promise<RunResult> {
  return createRunSse(form, handlers);
}

export async function createRunBlocking(form: RunFormState): Promise<RunResult> {
  return createRunJson(form);
}

export function assetUrl(runId: string, relPath: string): string {
  const encoded = relPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/runs/${encodeURIComponent(runId)}/files/${encoded}`;
}

export function zipUrl(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}/zip`;
}
