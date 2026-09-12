import type { BusContext, OmaResult } from "./bus";
import { executeShell } from "@/lib/shell/client";

/** One-shot entry for callers without an interactive terminal session. */
export async function command(
  input: string,
  ctx: BusContext,
): Promise<OmaResult> {
  const result = await executeShell(input, ctx);
  return { ok: result.exitCode === 0, message: result.stdout + result.stderr };
}
