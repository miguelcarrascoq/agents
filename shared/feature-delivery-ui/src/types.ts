export const AGENT_ORDER = [
  "researcher",
  "planner",
  "designer",
  "diagrammer",
  "illustrator",
  "coder",
  "reviewer",
] as const;

export type AgentName = (typeof AGENT_ORDER)[number];

export const DEFAULT_AGENTS: AgentName[] = [
  "planner",
  "designer",
  "coder",
  "reviewer",
];

export const AGENT_META: Record<AgentName, { name: string; hint: string }> = {
  researcher: { name: "Researcher", hint: "web search" },
  planner: { name: "Planner", hint: "plan.md" },
  designer: { name: "Designer", hint: "design.md" },
  diagrammer: { name: "Diagrammer", hint: "Mermaid" },
  illustrator: { name: "Illustrator", hint: "PNG assets" },
  coder: { name: "Coder", hint: "src/**" },
  reviewer: { name: "Reviewer", hint: "review.md" },
};

export type Provider = "openai" | "deepseek" | "openrouter";

export type RunFormState = {
  request: string;
  provider: Provider;
  model: string;
  runId: string;
  agents: AgentName[];
  quiet: boolean;
};

export type RunResult = {
  run_id: string;
  output_dir?: string;
  request?: string;
  plan?: string;
  design?: string;
  review?: string;
  research?: string;
  files?: string[];
  diagrams?: string[];
  assets?: string[];
  provider?: string;
  model?: string;
};

export type Template = {
  id: string;
  title: string;
  blurb: string;
  form: Partial<RunFormState> & { request: string; agents: AgentName[] };
};
