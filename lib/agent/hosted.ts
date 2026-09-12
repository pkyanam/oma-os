import { createOpenAI } from "@ai-sdk/openai";
import { isWorkersAIModel } from "./workers-models";
export { WORKERS_AI_DEFAULT_MODEL as WORKERS_AI_MODEL } from "./workers-models";
export function workersAIAvailability(value: unknown) {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const models = Array.isArray(data.models)
    ? data.models.filter((model): model is string => isWorkersAIModel(model))
    : [];
  return { enabled: data.enabled === true && models.length > 0, models };
}
export function workersAIModel(model: string, transport: typeof fetch = fetch) {
  if (!isWorkersAIModel(model))
    throw new Error(
      "Choose the supported Workers AI model in Model & connection.",
    );
  return createOpenAI({
    apiKey: "same-origin",
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
