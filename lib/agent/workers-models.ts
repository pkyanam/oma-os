/** Explicit deployment allowlist verified against Workers AI catalog and schemas.
 * Provider availability is checked by the deployment; there is no model fallback. */
export const WORKERS_AI_MODELS = [
  { id: "@cf/deepseek-ai/deepseek-v4-flash-0731", name: "DeepSeek V4 Flash" },
  { id: "@cf/zai-org/glm-5.3-flash", name: "GLM 5.3 Flash" },
  { id: "@cf/qwen/qwen3.8-27b", name: "Qwen 3.8 27B" },
  { id: "@cf/moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code" },
] as const;
export const WORKERS_AI_DEFAULT_MODEL = WORKERS_AI_MODELS[0].id;
export function isWorkersAIModel(model: unknown): model is string {
  return (
    typeof model === "string" &&
    WORKERS_AI_MODELS.some((item) => item.id === model)
  );
}
