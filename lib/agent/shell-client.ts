export type AgentShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};
/** Each invocation has a fresh worker: no session state or desktop command channel. */
export function executeAgentShell(
  script: string,
  signal: AbortSignal,
): Promise<AgentShellResult> {
  signal.throwIfAborted();
  if (new TextEncoder().encode(script).length > 16000)
    throw new Error("Shell scripts are limited to 16,000 bytes.");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./shell.worker.ts", import.meta.url), {
      type: "module",
    });
    let done = false;
    const finish = (result?: AgentShellResult, error?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () =>
      finish(
        undefined,
        signal.reason ?? new DOMException("Agent shell stopped", "AbortError"),
      );
    const timer = setTimeout(
      () =>
        finish({
          stdout: "",
          stderr: "Read-only shell reached its 20-second worker deadline.",
          exitCode: 124,
        }),
      20000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      finish({
        stdout: "",
        stderr: "Read-only shell worker failed. Reload the desktop and retry.",
        exitCode: 1,
      });
    worker.onmessage = (event) => {
      const value = event.data;
      if (
        !value ||
        typeof value.stdout !== "string" ||
        typeof value.stderr !== "string" ||
        typeof value.exitCode !== "number"
      )
        return finish({
          stdout: "",
          stderr: "Invalid shell result.",
          exitCode: 1,
        });
      finish({
        stdout: value.stdout.slice(0, 64000),
        stderr: value.stderr.slice(0, 16000),
        exitCode: value.exitCode,
      });
    };
    worker.postMessage({ type: "execute", script });
  });
}
