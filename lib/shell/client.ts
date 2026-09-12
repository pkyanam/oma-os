import type { BusContext } from "@/lib/oma/bus";
import { oma } from "@/lib/oma/bus";
import type { ShellResult } from "./engine";

export async function desktopCommand(
  ctx: BusContext,
  name: string,
  args: string[],
  cwd: string,
  stdin: string,
) {
  const resolve = (path: string) =>
    ctx.fs.normalize(path.startsWith("/") ? path : `${cwd}/${path}`);
  try {
    if (name === "edit") {
      if (!args[0]) throw new Error("usage: edit PATH");
      const path = resolve(args[0]);
      await ctx.fs.read(path);
      ctx.store.getState().launch("editor", path);
      return { stdout: `opened ${path}\n`, stderr: "", exitCode: 0 };
    }
    const argv =
      name === "oma" ? [...args] : [name === "quit" ? "close" : name, ...args];
    if (argv[0] === "open" && argv[1]) {
      const target = argv[1];
      if (
        /^https?:\/\//i.test(target) ||
        (!target.startsWith("/") &&
          !target.startsWith(".") &&
          !(await ctx.fs.exists(resolve(target))))
      )
        argv[0] = "browse";
      else argv[1] = resolve(target);
    }
    if (argv[0] === "run" && argv[1]) argv[1] = resolve(argv[1]);
    if (argv[0] === "fs" && argv[2]) argv[2] = resolve(argv[2]);
    if (argv[0] === "launch" && argv[2] && argv[1] !== "browser")
      argv[2] = resolve(argv[2]);
    const result = await oma(argv, { ...ctx, stdin });
    return {
      stdout: result.ok && result.message ? result.message + "\n" : "",
      stderr: !result.ok ? result.message + "\n" : "",
      exitCode: result.ok ? 0 : 1,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: (error instanceof Error ? error.message : String(error)) + "\n",
      exitCode: 1,
    };
  }
}

/** Every terminal owns a disposable worker. Cancelling kills compute, not completed writes. */
export function createShellSession(ctx: BusContext) {
  let worker: Worker | null = null,
    pending: {
      resolve: (result: ShellResult) => void;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;
  let cwd = "/home/guest";
  const stop = (reason: string, code: number) => {
    worker?.terminate();
    worker = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve({ stdout: "", stderr: reason, exitCode: code, cwd });
      pending = null;
      ctx.store.getState().refreshFs();
    }
    cwd = "/home/guest";
  };
  return {
    get cwd() {
      return cwd;
    },
    cancel: () =>
      stop(
        "Interrupted. Shell state reset; completed file writes remain.\n",
        130,
      ),
    dispose: () => stop("Terminal closed.\n", 130),
    execute(script: string): Promise<ShellResult> {
      if (pending) return Promise.reject(new Error("Shell is already running"));
      if (!script.trim())
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0, cwd });
      if (
        /^\s*(?:exit(?:\s+\d+)?|quit|close|oma\s+close)\s*;?\s*$/.test(script)
      ) {
        return desktopCommand(ctx, "close", [], cwd, "").then((result) => ({
          ...result,
          cwd,
        }));
      }
      if (new TextEncoder().encode(script).length > 128 * 1024)
        return Promise.resolve({
          stdout: "",
          stderr: "Script exceeds 128 KiB limit\n",
          exitCode: 1,
          cwd,
        });
      if (!worker) {
        worker = new Worker(new URL("./shell.worker.ts", import.meta.url), {
          type: "module",
        });
        const current = worker;
        current.onmessage = (event) => {
          if (worker !== current) return;
          const message = event.data;
          if (message.type === "desktop") {
            void desktopCommand(
              ctx,
              message.name,
              message.args,
              message.cwd,
              message.stdin,
            ).then((result) => {
              if (worker === current)
                current.postMessage({
                  type: "desktop-result",
                  callId: message.callId,
                  result,
                });
            });
          } else if (message.type === "result" && pending) {
            clearTimeout(pending.timer);
            cwd = message.result.cwd;
            if (message.dirty) ctx.store.getState().refreshFs();
            pending.resolve(message.result);
            pending = null;
          }
        };
        current.onerror = () =>
          stop(
            "Shell worker failed to load. Reload the desktop and retry.\n",
            1,
          );
      }
      return new Promise((resolve) => {
        pending = {
          resolve,
          timer: setTimeout(
            () =>
              stop(
                "Shell exceeded 20s worker deadline. State reset; completed file writes remain.\n",
                124,
              ),
            20_000,
          ),
        };
        worker!.postMessage({ type: "execute", script });
      });
    },
  };
}

export async function executeShell(
  script: string,
  ctx: BusContext,
  signal?: AbortSignal,
): Promise<ShellResult> {
  const session = createShellSession(ctx),
    abort = () => session.cancel();
  if (signal?.aborted)
    return { stdout: "", stderr: "Aborted", exitCode: 130, cwd: session.cwd };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await session.execute(script);
  } finally {
    signal?.removeEventListener("abort", abort);
    session.dispose();
  }
}
