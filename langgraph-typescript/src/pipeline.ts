import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { resolveLlmSettings, type LlmSettings } from "./llmConfig.js";
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

const SPANISH_SYSTEM =
  "Eres parte de un equipo de ingeniería de software. Responde siempre en español. " +
  "Los identificadores de código pueden estar en inglés. Sé concreto y accionable.";

const FRAMEWORK = "langgraph-typescript";

type GraphState = {
  request: string;
  runId: string;
  outputDir: string;
  research: string;
  plan: string;
  design: string;
  review: string;
  revisionNotes: string;
  coderPasses: number;
  files: string[];
  diagrams: string[];
  assets: string[];
};

function buildLlm(settings: LlmSettings) {
  return new ChatOpenAI({
    model: settings.model,
    apiKey: settings.apiKey,
    temperature: 0.2,
    configuration: settings.baseUrl ? { baseURL: settings.baseUrl } : undefined,
  });
}

async function call(llm: ChatOpenAI, system: string, user: string): Promise<string> {
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
  return String(res.content);
}

function stripMermaidFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:mermaid)?\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

function materializeFiles(sandbox: Sandbox, bundle: string) {
  const parts = bundle.split("=== FILE:");
  for (const part of parts.slice(1)) {
    const endIdx = part.indexOf("=== END FILE ===");
    const header = endIdx >= 0 ? part.slice(0, endIdx) : part;
    const lines = header.trim().split("\n");
    if (!lines.length) continue;
    let filePath = lines[0].replace(/===/g, "").trim();
    const content = lines.slice(1).join("\n").trim();
    if (!filePath.startsWith("src/")) filePath = `src/${filePath.replace(/^\//, "")}`;
    sandbox.writeFile(filePath, content + "\n");
  }
}

function buildNodeHandlers(sandbox: Sandbox, llm: ChatOpenAI) {
  const researcher = async (state: GraphState) => {
    const web = await sandbox.webSearch(state.request);
    const knowledge = sandbox.searchKnowledge(state.request);
    const research = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Researcher. Sintetiza hallazgos web y knowledge local en research.md: " +
        "fuentes citadas, resumen ejecutivo e implicaciones para la feature.",
      `Feature request:\n${state.request}\n\nWeb:\n${web}\n\nKnowledge:\n${knowledge}`,
    );
    sandbox.writeFile("research.md", research);
    return { research };
  };

  const planner = async (state: GraphState) => {
    const knowledge = sandbox.searchKnowledge(state.request);
    const research =
      state.research ||
      (sandbox.readFile("research.md").startsWith("ERROR") ? "" : sandbox.readFile("research.md"));
    const plan = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Planner. Produce un plan de entrega en markdown con: contexto, " +
        "criterios de aceptación, tareas ordenadas, riesgos y fuera de alcance.",
      `Feature request:\n${state.request}\n\nResearch:\n${research}\n\nKnowledge:\n${knowledge}`,
    );
    sandbox.writeFile("plan.md", plan);
    return { plan };
  };

  const designer = async (state: GraphState) => {
    const knowledge = sandbox.searchKnowledge(`${state.request} api design`);
    const design = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Designer/Architect. Produce design.md en markdown con: componentes, " +
        "APIs, modelo de datos, trade-offs y un diagrama de componentes. OBLIGATORIO: el " +
        "diagrama debe ir en un fence ```mermaid con flowchart TD o flowchart LR. " +
        "Etiquetas en texto plano (sin HTML ni <br>). PROHIBIDO: diagramas ASCII/textual, " +
        "sequenceDiagram, classDiagram.",
      `Request:\n${state.request}\n\nPlan:\n${state.plan}\n\nKnowledge:\n${knowledge}`,
    );
    sandbox.writeFile("design.md", design);
    return { design };
  };

  const diagrammer = async (state: GraphState) => {
    const arch = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Diagrammer. Genera SOLO código Mermaid válido para un diagrama de arquitectura " +
        "(debe empezar con flowchart TD, flowchart LR o graph TD). Sin markdown ni explicaciones.",
      `Request:\n${state.request}\n\nPlan:\n${state.plan}\n\nDesign:\n${state.design}`,
    );
    sandbox.writeMermaid("architecture.mmd", stripMermaidFences(arch));
    const seq = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Diagrammer. Genera SOLO código Mermaid válido para un flujo temporal " +
        "(pasos / secuencia de interacción) usando 'flowchart LR' o 'flowchart TD'. " +
        "NO uses sequenceDiagram ni classDiagram. Sin markdown ni explicaciones.",
      `Request:\n${state.request}\n\nPlan:\n${state.plan}\n\nDesign:\n${state.design}`,
    );
    sandbox.writeMermaid("sequence.mmd", stripMermaidFences(seq));
    const diagrams = sandbox
      .listWrittenFiles()
      .filter((f) => f.startsWith("diagrams/") && f.endsWith(".mmd"));
    return { diagrams };
  };

  const illustrator = async (state: GraphState) => {
    let research = state.research || sandbox.readFile("research.md");
    if (research.startsWith("ERROR")) research = "";
    const promptsText = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Illustrator. Propón exactamente 1-2 prompts en inglés para imágenes. " +
        "Si hay Design de producto, prioriza mockups UI; si no, genera la imagen pedida " +
        "usando Research/Request. Responde SOLO con líneas: PROMPT1: ... y PROMPT2: ...",
      `Request:\n${state.request}\n\nResearch:\n${research}\n\nDesign:\n${state.design}`,
    );
    const assets: string[] = [];
    let index = 0;
    for (const line of promptsText.split("\n")) {
      if (!line.trim().toUpperCase().startsWith("PROMPT")) continue;
      const prompt = line.split(":").slice(1).join(":").trim();
      if (!prompt) continue;
      index += 1;
      const result = await sandbox.generateImage(prompt, `image_${index}.png`);
      if (result.startsWith("Generated image at ")) {
        assets.push(result.replace("Generated image at ", ""));
      }
    }
    return { assets };
  };

  const coder = async (state: GraphState) => {
    const knowledge = sandbox.searchKnowledge(state.request);
    let prompt =
      `Request:\n${state.request}\n\nPlan:\n${state.plan}\n\nDesign:\n${state.design}\n\nKnowledge:\n${knowledge}\n`;
    if (state.revisionNotes) {
      prompt += `\nNotas de revisión a corregir:\n${state.revisionNotes}\n`;
    }
    const codeBundle = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Coder. Genera implementación mínima. Responde SOLO con bloques:\n" +
        "=== FILE: src/ruta/archivo.ext ===\n...contenido...\n=== END FILE ===",
      prompt,
    );
    materializeFiles(sandbox, codeBundle);
    const files = sandbox.listWrittenFiles().filter((f) => f.startsWith("src/"));
    return { files, coderPasses: (state.coderPasses ?? 0) + 1 };
  };

  const reviewer = async (state: GraphState) => {
    const listing = sandbox.listFiles("src");
    const blobs = (state.files ?? [])
      .map((rel) => `----- ${rel} -----\n${sandbox.readFile(rel)}`)
      .join("\n");
    const checklist = sandbox.searchKnowledge("code review checklist seguridad");
    const review = await call(
      llm,
      SPANISH_SYSTEM +
        " Eres el Reviewer. Escribe review.md con hallazgos y veredicto " +
        "`approve` | `request_changes` | `comment`. Si request_changes, incluye " +
        "## Notas para el coder.",
      `Request:\n${state.request}\n\nPlan:\n${state.plan}\n\nDesign:\n${state.design}\n\nFiles:\n${listing}\n\nCode:\n${blobs}\n\nChecklist:\n${checklist}`,
    );
    sandbox.writeFile("review.md", review);
    const notes = review.toLowerCase().includes("request_changes") ? review : "";
    return { review, revisionNotes: notes };
  };

  return {
    researcher,
    planner,
    designer,
    diagrammer,
    illustrator,
    coder,
    reviewer,
  } satisfies Record<Phase, (state: GraphState) => Promise<Partial<GraphState>>>;
}

export type RunOptions = {
  provider?: string;
  model?: string;
  runId?: string;
  agents?: string | string[];
};

export async function runFeatureDelivery(
  request: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const selected = parseAgents(options.agents);
  const settings = resolveLlmSettings(options.provider, options.model);
  const llm = buildLlm(settings);
  const runId = options.runId ?? randomBytes(5).toString("hex");
  const outputDir = path.join(OUTPUT_DIR, runId);
  const sandbox = new Sandbox(outputDir, KNOWLEDGE_DIR);
  validateAgentSelection(selected, sandbox);
  const nodes = buildNodeHandlers(sandbox, llm);

  const artifacts = loadArtifacts(sandbox);
  let state: GraphState = {
    request,
    runId,
    outputDir,
    research: artifacts.research,
    plan: artifacts.plan,
    design: artifacts.design,
    review: artifacts.review,
    revisionNotes: "",
    coderPasses: 0,
    files: artifacts.files,
    diagrams: artifacts.diagrams,
    assets: artifacts.assets,
  };

  const total = selected.length;
  for (let index = 0; index < selected.length; index++) {
    const phase = selected[index];
    ensurePrerequisites(phase, sandbox);
    logPhaseStart(phase, index + 1, total, runId, FRAMEWORK);
    const updates = await nodes[phase](state);
    state = { ...state, ...updates };

    if (
      phase === "reviewer" &&
      selected.includes("coder") &&
      selected.includes("reviewer") &&
      (state.coderPasses ?? 0) < 2 &&
      (state.review ?? "").toLowerCase().includes("request_changes")
    ) {
      ensurePrerequisites("coder", sandbox);
      logPhaseStart("coder", index + 1, total, runId, `${FRAMEWORK} (revision loop)`);
      const coderUpdates = await nodes.coder(state);
      state = { ...state, ...coderUpdates };
      logPhaseStart("reviewer", index + 1, total, runId, `${FRAMEWORK} (re-review)`);
      const reviewUpdates = await nodes.reviewer(state);
      state = { ...state, ...reviewUpdates };
    }
  }

  const result: RunResult = {
    run_id: runId,
    output_dir: outputDir,
    request,
    research: state.research ?? "",
    plan: state.plan ?? "",
    design: state.design ?? "",
    review: state.review ?? "",
    files: state.files?.length ? state.files : sandbox.listWrittenFiles(),
    diagrams: state.diagrams ?? [],
    assets: state.assets ?? [],
    provider: settings.provider,
    model: settings.model,
  };
  writeSummary(result);
  announceResults(result);
  return result;
}
