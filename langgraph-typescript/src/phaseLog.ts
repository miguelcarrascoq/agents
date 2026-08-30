import { AsyncLocalStorage } from "node:async_hooks";

import { Sandbox } from "./tools.js";

export const PHASES = [
  "researcher",
  "planner",
  "designer",
  "diagrammer",
  "illustrator",
  "coder",
  "reviewer",
] as const;

export const DEFAULT_PHASES = ["planner", "designer", "coder", "reviewer"] as const;

export type Phase = (typeof PHASES)[number];

const PREREQUISITES: Record<Phase, string[]> = {
  researcher: [],
  planner: [],
  designer: ["plan.md"],
  diagrammer: ["plan.md", "design.md"],
  illustrator: [],
  coder: ["plan.md", "design.md"],
  reviewer: ["plan.md", "design.md"],
};

const ARTIFACT_PRODUCERS: Record<string, Phase> = {
  "plan.md": "planner",
  "design.md": "designer",
  "research.md": "researcher",
};

export function parseAgents(value?: string | string[]): Phase[] {
  if (value == null) return [...DEFAULT_PHASES];
  const raw =
    typeof value === "string"
      ? value
          .replace(/,/g, " ")
          .split(/\s+/)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean)
      : value.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!raw.length) return [...DEFAULT_PHASES];
  const unknown = raw.filter((a) => !PHASES.includes(a as Phase));
  if (unknown.length) {
    throw new Error(
      `Unknown agent(s): ${unknown.join(", ")}. Valid: ${PHASES.join(", ")}`,
    );
  }
  return PHASES.filter((p) => raw.includes(p));
}

function readArtifact(sandbox: Sandbox, filePath: string): string {
  const text = sandbox.readFile(filePath);
  return text.startsWith("ERROR") ? "" : text;
}

export function loadArtifacts(sandbox: Sandbox) {
  const written = sandbox.listWrittenFiles();
  return {
    plan: readArtifact(sandbox, "plan.md"),
    design: readArtifact(sandbox, "design.md"),
    review: readArtifact(sandbox, "review.md"),
    research: readArtifact(sandbox, "research.md"),
    files: written.filter((f) => f.startsWith("src/")),
    diagrams: written.filter((f) => f.startsWith("diagrams/") && f.endsWith(".mmd")),
    assets: written.filter((f) => f.startsWith("assets/") && f.endsWith(".png")),
  };
}

export function ensurePrerequisites(phase: Phase, sandbox: Sandbox): void {
  const missing: string[] = [];
  for (const artifact of PREREQUISITES[phase]) {
    if (sandbox.readFile(artifact).startsWith("ERROR")) missing.push(artifact);
  }
  if (phase === "reviewer") {
    const srcFiles = sandbox.listWrittenFiles().filter((f) => f.startsWith("src/"));
    if (!srcFiles.length) missing.push("src/**");
  }
  if (missing.length) {
    throw new Error(
      `Cannot run '${phase}': missing prerequisite(s): ${missing.join(", ")}. ` +
        "Run earlier phase(s) first or reuse --run-id with existing artifacts.",
    );
  }
}

export function validateAgentSelection(selected: Phase[], sandbox: Sandbox): void {
  const errors: string[] = [];
  for (const phase of selected) {
    for (const artifact of PREREQUISITES[phase]) {
      if (!sandbox.readFile(artifact).startsWith("ERROR")) continue;
      const producer = ARTIFACT_PRODUCERS[artifact];
      if (producer && selected.includes(producer) && selected.indexOf(producer) < selected.indexOf(phase)) {
        continue;
      }
      if (producer) {
        errors.push(
          `'${phase}' needs ${artifact} — add '${producer}' before it in --agents, ` +
            "or pass --run-id with existing artifacts",
        );
      } else {
        errors.push(`'${phase}' needs ${artifact}`);
      }
    }
    if (phase === "reviewer") {
      const srcFiles = sandbox.listWrittenFiles().filter((f) => f.startsWith("src/"));
      if (
        !srcFiles.length &&
        !(selected.includes("coder") && selected.indexOf("coder") < selected.indexOf("reviewer"))
      ) {
        errors.push(
          "'reviewer' needs src/** — add 'coder' before it in --agents, " +
            "or pass --run-id with existing code",
        );
      }
    }
  }
  if (errors.length) {
    throw new Error(`Invalid agent selection:\n- ${errors.join("\n- ")}`);
  }
}

export type PhaseEvent = {
  phase: string;
  index: number;
  total: number;
  run_id: string;
  framework: string;
};

type PhaseListener = (event: PhaseEvent) => void;

const phaseStore = new AsyncLocalStorage<PhaseListener>();

/** Run `fn` with a phase listener visible to `logPhaseStart` (HTTP SSE). */
export function runWithPhaseListener<T>(
  listener: PhaseListener,
  fn: () => Promise<T>,
): Promise<T> {
  return phaseStore.run(listener, fn);
}

export function logPhaseStart(
  phase: string,
  index: number,
  total: number,
  runId: string,
  framework: string,
): void {
  const banner =
    `\n${"═".repeat(40)}\n` +
    `Pipeline ${index}/${total} · ${phase}\n` +
    `(run_id=${runId} · ${framework})\n` +
    `${"═".repeat(40)}\n`;
  process.stderr.write(banner);
  phaseStore.getStore()?.({
    phase,
    index,
    total,
    run_id: runId,
    framework,
  });
}
