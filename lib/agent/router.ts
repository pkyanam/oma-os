import { agentCapabilities, inspectDesktop } from "../oma/agent-contract";
import { useAgentConfig } from "./settings";
import { oma, type BusContext } from "@/lib/oma/bus";
import { parse } from "@/lib/oma/parse";
export async function routeAgent(
  input: string,
  ctx: BusContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<string> {
  try {
    if (/^\s*\/sh(?:\s|$)/.test(input)) {
      const script = input.replace(/^\s*\/sh\s*/, "");
      if (!script.trim())
        return "Usage: /sh SCRIPT — read-only shell over your desktop files";
      const { executeAgentShell } = await import("./shell-client");
      const result = await executeAgentShell(script, signal);
      return [
        result.stdout,
        result.stderr,
        `Exit ${result.exitCode} · read-only shell`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    const [cmd, ...args] = parse(input);
    switch (cmd) {
      case "/capabilities":
        return JSON.stringify(
          agentCapabilities(useAgentConfig.getState().tools),
          null,
          2,
        );
      case "/inspect":
        return JSON.stringify(
          inspectDesktop(ctx.store.getState(), useAgentConfig.getState()),
          null,
          2,
        );
      case "/help":
        return "/help · /inspect · /capabilities · /theme <id> · /launch <app> · /ws <1–9> · /ls · /sh <read-only script>";
      case "/theme":
        return (await oma(["theme", "set", ...args], ctx)).message;
      case "/launch":
      case "/ws":
        return (await oma([cmd.slice(1), ...args], ctx)).message;
      case "/ls":
        return (await oma(["fs", "ls", ...args], ctx)).message;
      default:
        return "offline: no model configured";
    }
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
