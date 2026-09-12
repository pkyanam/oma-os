import { agentErrorText } from "../../../lib/agent/errors";

/** Normalize only model errors; never forward HTML block pages or credentials. */
export async function normalizeModelError(
  response: Response,
): Promise<Response> {
  if (response.ok) return response;
  let body = "";
  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 65536) {
          body = "";
          break;
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  const fallback =
    response.status === 403
      ? "OpenAI rejected this server's ChatGPT model request."
      : response.status === 401
        ? "The ChatGPT session was rejected. Sign in again."
        : `ChatGPT model request failed (HTTP ${response.status}).`;
  const message = agentErrorText({ responseBody: body, message: fallback });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: "chatgpt_proxy_error",
        code: `chatgpt_http_${response.status}`,
      },
    }),
    { status: response.status, headers },
  );
}
