import type { AgentConfig } from "./settings";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";
function parse(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || value.length > 65536) return;
  try {
    const result: unknown = JSON.parse(value);
    return record(result) ? result : undefined;
  } catch {
    return;
  }
}
function clean(value: unknown): string {
  if (
    typeof value !== "string" ||
    /<\s*(?:html|!doctype|body|head)/i.test(value)
  )
    return "";
  return value
    .trim()
    .slice(0, 1500)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, "[redacted]");
}
/** SDK proxy errors can have an empty message and keep the real error in detail. */
export function agentErrorText(
  error: unknown,
  mode?: AgentConfig["mode"],
): string {
  const data = record(error) ? error : {};
  const body = parse(data.responseBody);
  const nested = parse(body?.detail);
  const status = Number(data.statusCode ?? data.status ?? body?.status);
  const detail =
    clean(record(nested?.error) ? nested.error.message : nested?.message) ||
    clean(record(body?.error) ? body.error.message : body?.message) ||
    clean(data.message) ||
    clean(typeof error === "string" ? error : "");
  if (status === 403 && mode === "chatgpt")
    return `OpenAI rejected the ChatGPT model request (HTTP 403). Sign-in does not guarantee model access from this server.${detail ? " " + detail : ""} Choose Workers AI or Provider key in Model & connection to continue.`;
  if (status === 401 && mode === "chatgpt")
    return "Your ChatGPT session was rejected (HTTP 401). Open Model & connection and sign in again.";
  const prefix =
    Number.isInteger(status) && status >= 400 && status <= 599
      ? `HTTP ${status}: `
      : "";
  if (detail) return prefix + detail;
  return (
    prefix +
    "The request failed without an error message. Check Model & connection and try again."
  );
}
