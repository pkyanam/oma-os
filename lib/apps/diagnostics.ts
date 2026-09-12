export type DiagnosticRow = {
  label: string;
  value: string;
  detail: string;
  status: "ok" | "info" | "error";
};
export function describeModel(input: {
  mode: "direct" | "chatgpt";
  model: string;
  authenticated: boolean;
  status: "offline" | "idle" | "think" | "err";
}): DiagnosticRow {
  const mode = input.mode === "chatgpt" ? "ChatGPT login" : "Direct provider";
  const model = input.model
    ? `Selected model: ${input.model.slice(0, 200)}.`
    : "No model selected.";
  if (input.status === "err")
    return {
      label: "Agent",
      value: "Last run reported an error",
      detail: `${mode}. ${model} Open Agent to inspect the error and retry. Your desktop and files still work.`,
      status: "error",
    };
  if (input.status === "think")
    return {
      label: "Agent",
      value: "Running",
      detail: `${mode}. ${model}`,
      status: "ok",
    };
  if (
    input.status === "offline" ||
    !input.model ||
    (input.mode === "chatgpt" && !input.authenticated)
  )
    return {
      label: "Agent",
      value: "Desktop ready; no active model",
      detail: `${mode}. ${model} Model setup is optional. Notes, drawing, files, and local apps work without it.`,
      status: "info",
    };
  return {
    label: "Agent",
    value: "Configured",
    detail: `${mode}. ${model} Configuration is present; this check does not make a billed model request.`,
    status: "ok",
  };
}
export async function probeJSON(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<{
  ok: boolean;
  status: number | null;
  data: Record<string, unknown>;
}> {
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 5000);
  try {
    const response = await fetcher(url, {
      signal: abort.signal,
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data:
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {},
    };
  } catch {
    return { ok: false, status: null, data: {} };
  } finally {
    clearTimeout(timer);
  }
}
