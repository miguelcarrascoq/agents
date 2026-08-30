import "dotenv/config";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type LlmSettings = {
  provider: "openai" | "deepseek" | "openrouter";
  model: string;
  apiKey: string;
  baseUrl?: string;
};

export function resolveLlmSettings(
  provider?: string,
  model?: string,
): LlmSettings {
  const p = (provider || process.env.LLM_PROVIDER || "openai").toLowerCase();
  if (p !== "openai" && p !== "deepseek" && p !== "openrouter") {
    throw new Error(`Unsupported provider: ${p}`);
  }
  if (p === "openai") {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when provider=openai");
    return {
      provider: "openai",
      model: model || process.env.MODEL || "gpt-4.1-mini",
      apiKey,
    };
  }
  if (p === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY || "";
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required when provider=deepseek");
    return {
      provider: "deepseek",
      model: model || process.env.MODEL || "deepseek-chat",
      apiKey,
      baseUrl: DEEPSEEK_BASE_URL,
    };
  }
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required when provider=openrouter");
  return {
    provider: "openrouter",
    model: model || process.env.MODEL || "google/gemini-2.0-flash-001",
    apiKey,
    baseUrl: OPENROUTER_BASE_URL,
  };
}
