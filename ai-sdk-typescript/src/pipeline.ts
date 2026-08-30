import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { resolveLlmSettings } from "./llmConfig.js";
import { Sandbox } from "./tools.js";
import type { RunResult } from "./models.js";
import { announceResults, writeSummary } from "./models.js";
import {
  ensurePrerequisites,
  loadArtifacts,
  logPhaseStart,
  parseAgents,
  validateAgentSelection,
  type Phase,
} from "./phaseLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");
export const OUTPUT_DIR = path.join(ROOT, "output");

const SPANISH =
  "Responde siempre en español. Identificadores de código en inglés cuando sea natural.";

const FRAMEWORK = "ai-sdk";

/** Max tool-loop steps per phase (generateText stopWhen). */
const PHASE_MAX_STEPS = 8;

export type RunOptions = {
  provider?: string;
  model?: string;
  runId?: string;
  agents?: string | string[];
};

function buildModel(provider?: string, model?: string) {
  const settings = resolveLlmSettings(provider, model);
  const openai = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });
  return { model: openai(settings.model), settings };
}

function buildTools(sandbox: Sandbox) {
  return {
    search_knowledge: tool({
      description: "Search local engineering knowledge docs",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => sandbox.searchKnowledge(query),
    }),
    web_search: tool({
      description: "Search the web via DuckDuckGo (no API key required)",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => sandbox.webSearch(query),
    }),
    write_file: tool({
      description: "Write a file inside the run sandbox",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: filePath, content }) =>
        sandbox.writeFile(filePath, content),
    }),
    write_mermaid: tool({
      description: "Write a Mermaid diagram file under diagrams/",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: filePath, content }) =>
        sandbox.writeMermaid(filePath, content),
    }),
    generate_image: tool({
      description:
        "Generate a PNG mockup via OpenAI Images (requires OPENAI_API_KEY)",
      inputSchema: z.object({ prompt: z.string(), path: z.string() }),
      execute: async ({ prompt, path: filePath }) =>
        sandbox.generateImage(prompt, filePath),
    }),
    read_file: tool({
      description: "Read a file from the run sandbox",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path: filePath }) => sandbox.readFile(filePath),
    }),
    list_files: tool({
      description: "List files in the run sandbox",
      inputSchema: z.object({ prefix: z.string().optional() }),
      execute: async ({ prefix }) => sandbox.listFiles(prefix ?? ""),
    }),
  };
}

type PhaseContext = {
  request: string;
  research: string;
  plan: string;
  design: string;
};

type PhaseDef = {
  system: string;
  prompt: (ctx: PhaseContext) => string;
};

const PHASE_DEFS: Record<Phase, PhaseDef> = {
  researcher: {
    system: `${SPANISH} Eres el Researcher. Usa web_search y search_knowledge. Escribe research.md con write_file.`,
    prompt: (ctx) =>
      `Feature request:\n${ctx.request}\nEscribe research.md completo.`,
  },
  planner: {
    system: `${SPANISH} Eres el Planner. Usa search_knowledge si ayuda. Escribe plan.md con write_file.`,
    prompt: (ctx) =>
      `Feature request:\n${ctx.request}\n\nResearch:\n${ctx.research}\nEscribe plan.md completo.`,
  },
  designer: {
    system: `${SPANISH} Eres el Designer. Escribe design.md con write_file (componentes, APIs, datos). OBLIGATORIO: diagrama en fence \`\`\`mermaid con flowchart TD/LR. Etiquetas en texto plano (sin HTML ni <br>). PROHIBIDO: ASCII/textual, sequenceDiagram, classDiagram.`,
    prompt: (ctx) =>
      `Feature:\n${ctx.request}\n\nPlan:\n${ctx.plan}\nEscribe design.md con diagrama Mermaid de componentes (no ASCII).`,
  },
  diagrammer: {
    system: `${SPANISH} Eres el Diagrammer. Usa write_mermaid para diagrams/architecture.mmd y diagrams/sequence.mmd. REGLA: cada archivo debe empezar con 'flowchart TD' o 'flowchart LR' (o 'graph TD'). NO uses sequenceDiagram ni classDiagram. sequence.mmd = flujo temporal con flowchart; architecture.mmd = componentes.`,
    prompt: (ctx) =>
      `Feature:\n${ctx.request}\n\nPlan:\n${ctx.plan}\n\nDesign:\n${ctx.design}\n` +
      `Crea diagrams/architecture.mmd y diagrams/sequence.mmd con write_mermaid. ` +
      `Usa solo flowchart TD/LR o graph TD (nunca sequenceDiagram).`,
  },
  illustrator: {
    system: `${SPANISH} Eres el Illustrator. Usa generate_image para 1-2 imágenes en assets/. Si hay Design de producto, prioriza mockups UI; si no, genera la imagen pedida.`,
    prompt: (ctx) =>
      `Request:\n${ctx.request}\n\nResearch:\n${ctx.research}\n\nDesign:\n${ctx.design}\n` +
      `Usa generate_image para 1-2 imágenes en assets/ (prompts en inglés). ` +
      `Si hay Design de producto, prioriza mockups UI; si no, genera la imagen ` +
      `pedida usando Research/Request.`,
  },
  coder: {
    system: `${SPANISH} Eres el Coder. Implementa bajo src/ con write_file.`,
    prompt: (ctx) =>
      `Feature:\n${ctx.request}\n\nPlan:\n${ctx.plan}\n\nDesign:\n${ctx.design}\n` +
      `Implementa archivos bajo src/ con write_file.`,
  },
  reviewer: {
    system: `${SPANISH} Eres el Reviewer. Lee artefactos con tools y escribe review.md con veredicto.`,
    prompt: (ctx) =>
      `Feature:\n${ctx.request}\nLee plan.md, design.md y src/. Escribe review.md ` +
      `con hallazgos y veredicto approve|request_changes|comment. Usa search_knowledge para checklist.`,
  },
};

function buildPhaseRunners(
  sandbox: Sandbox,
  model: ReturnType<ReturnType<typeof createOpenAI>>,
  tools: ReturnType<typeof buildTools>,
) {
  async function runPhase(phase: Phase, ctx: PhaseContext) {
    const def = PHASE_DEFS[phase];
    const result = await generateText({
      model,
      system: def.system,
      prompt: def.prompt(ctx),
      stopWhen: stepCountIs(PHASE_MAX_STEPS),
      tools,
    });
    return result.text ?? "";
  }

  const runners: Record<
    Phase,
    (ctx: PhaseContext) => Promise<{
      research: string;
      plan: string;
      design: string;
      review: string;
    }>
  > = {
    researcher: async (ctx) => {
      const text = await runPhase("researcher", ctx);
      const researchFile = sandbox.readFile("research.md");
      const research = researchFile.startsWith("ERROR") ? text : researchFile;
      return { research, plan: ctx.plan, design: ctx.design, review: "" };
    },
    planner: async (ctx) => {
      const text = await runPhase("planner", ctx);
      const planFile = sandbox.readFile("plan.md");
      const plan = planFile.startsWith("ERROR") ? text : planFile;
      return { research: ctx.research, plan, design: ctx.design, review: "" };
    },
    designer: async (ctx) => {
      const text = await runPhase("designer", ctx);
      const designFile = sandbox.readFile("design.md");
      const design = designFile.startsWith("ERROR") ? text : designFile;
      return { research: ctx.research, plan: ctx.plan, design, review: "" };
    },
    diagrammer: async (ctx) => {
      await runPhase("diagrammer", ctx);
      return {
        research: ctx.research,
        plan: ctx.plan,
        design: ctx.design,
        review: "",
      };
    },
    illustrator: async (ctx) => {
      await runPhase("illustrator", ctx);
      return {
        research: ctx.research,
        plan: ctx.plan,
        design: ctx.design,
        review: "",
      };
    },
    coder: async (ctx) => {
      await runPhase("coder", ctx);
      return {
        research: ctx.research,
        plan: ctx.plan,
        design: ctx.design,
        review: "",
      };
    },
    reviewer: async (ctx) => {
      const text = await runPhase("reviewer", ctx);
      const reviewFile = sandbox.readFile("review.md");
      const review = reviewFile.startsWith("ERROR") ? text : reviewFile;
      return {
        research: ctx.research,
        plan: ctx.plan,
        design: ctx.design,
        review,
      };
    },
  };

  return runners;
}

export async function runFeatureDelivery(
  request: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const selected = parseAgents(options.agents);
  const { model, settings } = buildModel(options.provider, options.model);
  const runId = options.runId ?? randomBytes(5).toString("hex");
  const outputDir = path.join(OUTPUT_DIR, runId);
  const sandbox = new Sandbox(outputDir, KNOWLEDGE_DIR);
  validateAgentSelection(selected, sandbox);
  const tools = buildTools(sandbox);
  const runners = buildPhaseRunners(sandbox, model, tools);

  const artifacts = loadArtifacts(sandbox);
  let ctx: PhaseContext = {
    request,
    research: artifacts.research,
    plan: artifacts.plan,
    design: artifacts.design,
  };
  let review = artifacts.review;

  const total = selected.length;
  for (let index = 0; index < selected.length; index++) {
    const phase = selected[index];
    ensurePrerequisites(phase, sandbox);
    logPhaseStart(phase, index + 1, total, runId, FRAMEWORK);
    const result = await runners[phase](ctx);
    ctx = {
      request,
      research: result.research,
      plan: result.plan,
      design: result.design,
    };
    if (result.review) review = result.review;
  }

  const clean = (v: string) => (v?.startsWith("ERROR") ? "" : v || "");
  const finalArtifacts = loadArtifacts(sandbox);

  const runResult: RunResult = {
    run_id: runId,
    output_dir: outputDir,
    request,
    research: clean(ctx.research || sandbox.readFile("research.md")),
    plan: clean(ctx.plan || sandbox.readFile("plan.md")),
    design: clean(ctx.design || sandbox.readFile("design.md")),
    review: clean(review || sandbox.readFile("review.md")),
    files: sandbox.listWrittenFiles(),
    diagrams: finalArtifacts.diagrams,
    assets: finalArtifacts.assets,
    provider: settings.provider,
    model: settings.model,
  };
  writeSummary(runResult);
  announceResults(runResult);
  return runResult;
}
