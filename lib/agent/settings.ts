import { create } from "zustand";
import { persist } from "zustand/middleware";
export type AgentConfig = {
  mode: "chatgpt" | "direct" | "workers-ai";
  baseURL: string;
  apiKey: string;
  model: string;
  tools: boolean;
  modelsByMode?: Partial<Record<AgentConfig["mode"], string>>;
};
export function publicPreferences(
  value: unknown,
): Partial<
  Pick<AgentConfig, "mode" | "baseURL" | "model" | "tools" | "modelsByMode">
> {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const result: Partial<
    Pick<AgentConfig, "mode" | "baseURL" | "model" | "tools" | "modelsByMode">
  > = {};
  if (
    input.mode === "chatgpt" ||
    input.mode === "direct" ||
    input.mode === "workers-ai"
  )
    result.mode = input.mode;
  if (typeof input.baseURL === "string") {
    try {
      result.baseURL = providerURL(input.baseURL);
    } catch {
      /* Do not retain invalid or credential-bearing endpoints. */
    }
  }
  if (typeof input.model === "string" && input.model.length <= 200)
    result.model = input.model;
  if (typeof input.tools === "boolean") result.tools = input.tools;
  if (input.modelsByMode && typeof input.modelsByMode === "object") {
    result.modelsByMode = {};
    for (const mode of ["chatgpt", "direct", "workers-ai"] as const) {
      const model = (input.modelsByMode as Record<string, unknown>)[mode];
      if (typeof model === "string" && model.length <= 200)
        result.modelsByMode[mode] = model;
    }
  }
  return result;
}
export const useAgentConfig = create<
  AgentConfig & { authenticated: boolean }
>()(
  persist(
    (): AgentConfig & { authenticated: boolean } => ({
      mode: "chatgpt",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "",
      model: "",
      tools: true,
      authenticated: false,
    }),
    {
      name: "oma-agent-preferences-v1",
      partialize: publicPreferences,
      merge: (stored, current) => ({
        ...current,
        ...publicPreferences(stored),
      }),
    },
  ),
);
export function providerURL(input: string) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Use HTTPS, or HTTP on localhost.");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Use a base URL without credentials, query parameters or fragments.",
    );
  return url.href.replace(/\/$/, "");
}

export function selectAgentMode(mode: AgentConfig["mode"], defaultModel = "") {
  useAgentConfig.setState((current) => {
    const modelsByMode = {
      ...current.modelsByMode,
      [current.mode]: current.model,
    };
    return { mode, modelsByMode, model: modelsByMode[mode] || defaultModel };
  });
}
export function selectAgentModel(model: string) {
  useAgentConfig.setState((current) => ({
    model,
    modelsByMode: { ...current.modelsByMode, [current.mode]: model },
  }));
}
