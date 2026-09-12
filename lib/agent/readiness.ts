import type { AgentConfig } from "./settings";

/** Local configuration readiness only; no claim about provider availability. */
export function modelConnectionIssue(
  config: AgentConfig & { authenticated: boolean },
): string | null {
  if (!config.model.trim())
    return "Choose a model in Model & connection before sending a message.";
  if (config.mode === "chatgpt" && !config.authenticated)
    return "Sign in to ChatGPT in Model & connection to use the selected ChatGPT model.";
  if (config.mode === "direct" && !config.apiKey.trim())
    return "Add your provider key in Model & connection to use the selected direct model.";
  return null;
}
