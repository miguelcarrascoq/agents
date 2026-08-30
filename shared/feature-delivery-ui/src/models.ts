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
