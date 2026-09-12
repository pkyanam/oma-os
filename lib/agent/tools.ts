import {
  agentCapabilities,
  validateAgentCommand,
  commandError,
  commandFailure,
  type DesktopInspection,
} from "../oma/agent-contract";
import { jsonSchema, tool } from "ai";
import { scopedPath, privateAgentPath } from "./scope";
export { scopedPath } from "./scope";
import type { fs as fileSystem } from "../fs/opfs";

export type ApproveWrite = (
  path: string,
  before: string,
  after: string,
) => Promise<boolean>;
export type AgentFileSystem = Pick<
  typeof fileSystem,
  | "normalize"
  | "ls"
  | "read"
  | "write"
  | "writeBlob"
  | "exists"
  | "mkdir"
  | "search"
>;
export type AgentToolDependencies = {
  fs: AgentFileSystem;
  signal: AbortSignal;
  approve: ApproveWrite;
  refresh: () => void;
  command: (argv: string[]) => Promise<unknown>;
  inspect?: () => DesktopInspection;
  shell?: (
    script: string,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
};
export function desktopToolAllowed(argv: string[]) {
  return validateAgentCommand(argv) === null;
}
export function exactPatch(before: string, find: string, replacement: string) {
  if (!find) throw new Error("The text to replace must not be empty.");
  const index = before.indexOf(find);
  if (index < 0)
    throw new Error(
      "The text was not found. Read the current file before editing.",
    );
  if (before.indexOf(find, index + 1) >= 0)
    throw new Error(
      "The text occurs more than once. Include more surrounding text.",
    );
  return (
    before.slice(0, index) + replacement + before.slice(index + find.length)
  );
}
export function createDesktopTools(deps: AgentToolDependencies) {
  const { fs, signal, approve, refresh, command } = deps;
  return {
    read_only_shell: tool({
      description:
        "Run a real Just Bash script in a disposable browser worker over read-only desktop files. Supports pipes, grep, find, jq, sed (without -i), awk, sort, wc and shell variables. Cwd starts at /home/guest on every call. Scope: /home/guest and public /.oma files; private archives and credentials are inaccessible. ALL filesystem mutations including redirection are denied by the filesystem adapter, not a command-name filter. No network, native processes, Python, Node, or desktop command bridge. Use filesystem write/patch for edits and desktop for app control. Limits: 15 seconds execution, 20 seconds worker deadline, 64 KB output, 16 KB script.",
      inputSchema: jsonSchema<{ script: string }>({
        type: "object",
        properties: {
          script: { type: "string", minLength: 1, maxLength: 16000 },
        },
        required: ["script"],
        additionalProperties: false,
      }),
      execute: async ({ script }) => {
        signal.throwIfAborted();
        if (!deps.shell)
          return {
            ok: false,
            message: "The read-only shell is unavailable in this environment.",
          };
        try {
          const result = await deps.shell(script);
          signal.throwIfAborted();
          return { ok: result.exitCode === 0, ...result };
        } catch (error) {
          signal.throwIfAborted();
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
    filesystem: tool({
      description:
        "Work with local files under /home/guest or /.oma. list lists a directory; read returns file text; search finds matching filenames recursively (query is a filename substring); mkdir creates directories; write creates/replaces a file; patch replaces one exact unique text match using find and content. Read before editing. Existing-file changes require user approval. No deletion. Conversation archives are private.",
      inputSchema: jsonSchema<{
        action: "list" | "read" | "search" | "write" | "patch" | "mkdir";
        path: string;
        content?: string;
        find?: string;
        query?: string;
      }>({
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "read", "search", "write", "patch", "mkdir"],
          },
          path: { type: "string" },
          content: { type: "string" },
          find: { type: "string" },
          query: { type: "string" },
        },
        required: ["action", "path"],
        additionalProperties: false,
      }),
      execute: async ({ action, path, content, find, query }) => {
        signal.throwIfAborted();
        try {
          const p = scopedPath(fs, path);
          if (action === "list")
            return {
              ok: true,
              entries: (await fs.ls(p)).filter(
                (entry) => !privateAgentPath(entry.path),
              ),
            };
          if (action === "read") {
            const text = await fs.read(p);
            return {
              ok: true,
              path: p,
              content: text.slice(0, 64000),
              truncated: text.length > 64000,
              characters: text.length,
            };
          }
          if (action === "search") {
            const files = (await fs.search(p, 300)).filter(
              (entry) =>
                !privateAgentPath(entry.path) &&
                entry.path.toLowerCase().includes((query ?? "").toLowerCase()),
            );
            return {
              ok: true,
              entries: files.slice(0, 50),
              note: "Scans at most 300 files; returns at most 50 matches.",
            };
          }
          if (action === "mkdir") {
            await fs.mkdir(p);
            refresh();
            return { ok: true, path: p };
          }
          if (content === undefined)
            throw new Error("content is required for writes and patches.");
          const existing = await fs.exists(p);
          const before = existing ? await fs.read(p) : "";
          if (action === "patch" && !existing)
            throw new Error("Cannot patch a file that does not exist.");
          const after =
            action === "patch"
              ? exactPatch(before, find ?? "", content)
              : content;
          if (after.length > 100000)
            throw new Error("File exceeds 100,000 characters per write.");
          if (existing && before === after)
            return { ok: true, path: p, unchanged: true };
          if (existing && !(await approve(p, before, after)))
            return {
              ok: false,
              message:
                "User declined the change. Do not retry without new instructions.",
            };
          signal.throwIfAborted();
          // Creation and replacement have distinct concurrency guarantees.
          if (existing) await fs.write(p, after, before);
          else await fs.writeBlob(p, new Blob([after]), { overwrite: false });
          refresh();
          return {
            ok: true,
            path: p,
            characters: after.length,
            created: !existing,
          };
        } catch (error) {
          signal.throwIfAborted();
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
    desktop: tool({
      description:
        "Control oma.os with argv (without oma prefix). Start with capabilities for versioned command schemas, permissions, examples and error codes; inspect returns active workspace, focus, normalized layout bounds, declared document paths and live agent status. Also help, apps, version, ws N, launch APP_ID [PATH], open FILE_PATH, focus/swap direction, theme, window list|grow|shrink|fullscreen|move N, browse URL, run HTML_PATH. Launch success does not mean a browser page loaded. App selections, unsaved buffers and browser content are unavailable. This is not a Linux shell.",
      inputSchema: jsonSchema<{ argv: string[] }>({
        type: "object",
        properties: {
          argv: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
          },
        },
        required: ["argv"],
        additionalProperties: false,
      }),
      execute: async ({ argv }) => {
        signal.throwIfAborted();
        const invalid = validateAgentCommand(argv);
        if (invalid) return invalid;
        if (argv[0] === "capabilities")
          return {
            ok: true,
            message: "Agent contract 1.0.0",
            data: agentCapabilities(),
          };
        if (argv[0] === "inspect")
          return deps.inspect
            ? {
                ok: true,
                message: "Current desktop state",
                data: deps.inspect(),
              }
            : commandError(
                "UNAVAILABLE",
                "Desktop inspection is unavailable in this environment.",
                ["Use window list for declared window metadata."],
              );
        const requiresFocus =
          ["focus", "swap"].includes(argv[0]) ||
          (argv[0] === "window" && argv[1] !== "list");
        if (requiresFocus && deps.inspect && !deps.inspect().focusedWindow)
          return commandError(
            "CONTEXT_UNAVAILABLE",
            "There is no focused window in the active workspace.",
            ["Launch an app or switch to a workspace with windows."],
          );
        try {
          // Desktop launch must not bypass the filesystem tool's path scope.
          if (["open", "run"].includes(argv[0])) scopedPath(fs, argv[1]);
          if (argv[0] === "launch" && argv[2] && argv[1] !== "browser")
            scopedPath(fs, argv[2]);
          const result = (await command(argv)) as {
            ok?: boolean;
            message?: string;
            data?: unknown;
          };
          signal.throwIfAborted();
          if (result?.ok === false)
            return commandError(
              "EXECUTION_FAILED",
              result.message ?? "Desktop command failed.",
              [
                "Inspect current state and consult capabilities before retrying.",
              ],
            );
          return result;
        } catch (error) {
          signal.throwIfAborted();
          return commandFailure(error);
        }
      },
    }),
  };
}
