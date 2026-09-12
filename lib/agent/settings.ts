import { create } from "zustand";
import { persist } from "zustand/middleware";
export type AgentConfig = {
  mode: "chatgpt" | "direct";
  baseURL: string;
  apiKey: string;
  model: string;
  tools: boolean;
};
export function publicPreferences(
  value: unknown,
): Partial<Pick<AgentConfig, "mode" | "baseURL" | "model" | "tools">> {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const result: Partial<
    Pick<AgentConfig, "mode" | "baseURL" | "model" | "tools">
  > = {};
  if (input.mode === "chatgpt" || input.mode === "direct")
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
