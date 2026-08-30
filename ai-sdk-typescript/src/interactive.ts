import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runFeatureDelivery } from "./pipeline.js";
import { DEFAULT_PHASES, PHASES, type Phase } from "./phaseLog.js";
import { formatLocationReport } from "./models.js";

const AGENT_LABELS: Record<Phase, string> = {
  researcher: "Researcher — web search",
  planner: "Planner — plan.md",
  designer: "Designer — design.md",
  diagrammer: "Diagrammer — Mermaid diagrams",
  illustrator: "Illustrator — PNG assets",
  coder: "Coder — src/**",
  reviewer: "Reviewer — review.md",
};

const OUTPUT_DIR = "output";

function listRunIds(): string[] {
  try {
    const entries = readdirSync(OUTPUT_DIR);
    const runs = entries
      .filter((name) => !name.startsWith("."))
      .map((name) => {
        try {
          const st = statSync(join(OUTPUT_DIR, name));
          return st.isDirectory() ? { name, mtime: st.mtimeMs } : null;
        } catch {
          return null;
        }
      })
      .filter((x): x is { name: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime)
      .map((x) => x.name);
    return runs;
  } catch {
    return [];
  }
}

function agentsCsv(selected: Phase[]): string {
  return PHASES.filter((p) => selected.includes(p)).join(",");
}

function buildCliPreview(
  projectId: string,
  request: string,
  provider: string,
  model: string,
  runId: string | undefined,
  agents: string,
): string {
  const parts = ["npm start --"];
  const snippet = request.length > 60 ? `${request.slice(0, 60)}...` : request;
  if (snippet) parts.push(`"${snippet}"`);
  parts.push(`--provider ${provider}`);
  if (model) parts.push(`--model ${model}`);
  if (runId) parts.push(`--run-id ${runId}`);
  if (agents) parts.push(`--agents ${agents}`);
  return `# ${projectId}\n${parts.join(" ")}`;
}

export async function runInteractive(projectId: string): Promise<number> {
  console.log(`\n${projectId} — feature delivery pipeline (interactive)`);
  console.log("  ↑↓ move · Space toggle · Enter confirm · Esc cancel\n");

  try {
    const request = await input({
      message: "Feature request (español)",
      validate: (value) => (value.trim() ? true : "Required"),
    });

    const defaultProvider =
      process.env.LLM_PROVIDER === "deepseek" ? "deepseek" : "openai";

    const provider = await select({
      message: "Provider",
      choices: [
        { name: "openai", value: "openai" },
        { name: "deepseek", value: "deepseek" },
      ],
      default: defaultProvider,
    });

    const model = await input({
      message: "Model (optional, Enter to skip)",
      default: "",
    });

    const recentRuns = listRunIds();
    let runId: string | undefined;
    if (recentRuns.length) {
      const picked = await select({
        message: "Run ID (resume sandbox)",
        choices: [
          { name: "Auto (new run)", value: "" },
          ...recentRuns.slice(0, 12).map((id) => ({ name: id, value: id })),
          { name: "Custom…", value: "__custom__" },
        ],
      });
      if (picked === "__custom__") {
        const custom = await input({ message: "Custom run ID", default: "" });
        runId = custom.trim() || undefined;
      } else {
        runId = picked || undefined;
      }
    } else {
      const custom = await input({
        message: "Run ID (optional, Enter to skip)",
        default: "",
      });
      runId = custom.trim() || undefined;
    }

    const preset = await select({
      message: "Agent preset",
      choices: [
        {
          name: "Default (planner, designer, coder, reviewer)",
          value: "default",
        },
        {
          name: "Extended (all agents, incl. research + diagrams)",
          value: "extended",
        },
        { name: "Custom selection", value: "custom" },
      ],
      default: "default",
    });

    let selectedAgents: Phase[];
    if (preset === "default") {
      selectedAgents = [...DEFAULT_PHASES];
    } else if (preset === "extended") {
      selectedAgents = [...PHASES];
    } else {
      selectedAgents = await checkbox({
        message: "Agents (↑↓ move, Space toggle)",
        choices: PHASES.map((phase) => ({
          name: AGENT_LABELS[phase],
          value: phase,
          checked: (DEFAULT_PHASES as readonly string[]).includes(phase),
        })),
        required: true,
      });
    }

    const agents = agentsCsv(selectedAgents);
    console.log("\nCLI preview:");
    console.log(
      buildCliPreview(projectId, request, provider, model, runId, agents),
    );

    const ok = await confirm({
      message: "Run pipeline?",
      default: true,
    });
    if (!ok) {
      console.log("Cancelled.");
      return 0;
    }

    console.log("\nRunning pipeline…\n");

    const result = await runFeatureDelivery(request, {
      provider,
      model: model.trim() || undefined,
      runId,
      agents,
    });
    console.log(formatLocationReport(result));
    console.log(`provider=${result.provider} model=${result.model}`);
    return 0;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "ExitPromptError" || err.name === "AbortPromptError")
    ) {
      console.log("\nCancelled.");
      return 0;
    }
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
}
