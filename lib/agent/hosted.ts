import { createOpenAI } from "@ai-sdk/openai";
export const WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash";
export function workersAIAvailability(value: unknown) {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const models = Array.isArray(data.models)
    ? data.models.filter((model): model is string => model === WORKERS_AI_MODEL)
    : [];
  return { enabled: data.enabled === true && models.length > 0, models };
}
export function workersAIModel(model: string, transport: typeof fetch = fetch) {
  if (model !== WORKERS_AI_MODEL)
    throw new Error(
      "Choose the supported Workers AI model in Model & connection.",
    );
  return createOpenAI({
    apiKey: "cookie-authenticated",
    baseURL: "/api/ai/v1",
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.delete("authorization");
      return transport(input, {
        ...init,
        headers,
        credentials: "same-origin",
        redirect: "error",
      });
    },
  }).chat(model);
}
