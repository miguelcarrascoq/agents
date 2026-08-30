import type { Provider } from "./types";

export type ModelOption = {
  id: string;
  label: string;
  hint: string;
};

export const MODEL_OPTIONS: Record<Provider, readonly ModelOption[]> = {
  openai: [
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini", hint: "rápido / barato" },
    { id: "gpt-4.1", label: "gpt-4.1", hint: "mejor código" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "deepseek-chat", hint: "código / coste" },
    { id: "deepseek-reasoner", label: "deepseek-reasoner", hint: "razonamiento" },
  ],
  openrouter: [
    {
      id: "google/gemini-2.0-flash-001",
      label: "gemini-2.0-flash",
      hint: "muy barato / rápido",
    },
    {
      id: "qwen/qwen-2.5-coder-32b-instruct",
      label: "qwen-2.5-coder-32b",
      hint: "código económico",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      label: "llama-3.3-70b",
      hint: "general sólido",
    },
    {
      id: "openai/gpt-4.1-mini",
      label: "gpt-4.1-mini (via OR)",
      hint: "barato vía OpenRouter",
    },
  ],
} as const;

export function modelsFor(provider: Provider): readonly ModelOption[] {
  return MODEL_OPTIONS[provider];
}

export function defaultModelFor(provider: Provider): string {
  return MODEL_OPTIONS[provider][0].id;
}

export function isKnownModel(provider: Provider, model: string): boolean {
  return MODEL_OPTIONS[provider].some((m) => m.id === model);
}

/** Short display label for a model id (known option label, else last path segment). */
export function modelLabel(provider: Provider, model: string): string {
  const known = MODEL_OPTIONS[provider]?.find((m) => m.id === model);
  if (known) return known.label;
  const slash = model.lastIndexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}
