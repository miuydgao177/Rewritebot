const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export function getModelProvider() {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      url: DEEPSEEK_API_URL,
      headers: {},
      extraBody: {
        thinking: { type: "disabled" },
      },
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
      fallbackModels: ["liquid/lfm-2.5-2.6b:free", "openrouter/free"],
      url: OPENROUTER_API_URL,
      headers: {
        "http-referer": "http://127.0.0.1:3001",
        "x-title": "XHS Content Rewrite Assistant",
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      url: OPENAI_API_URL,
      headers: {},
    };
  }

  return null;
}

export function buildModelCandidates(provider) {
  return [...new Set([provider.model, ...(provider.fallbackModels || [])].filter(Boolean))];
}
