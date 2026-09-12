import { apps } from "../apps/registry";
import { geometry, type LayoutNode } from "../layout/tree";

export const AGENT_CONTRACT_VERSION = "1.0.0";
export const ERROR_CODES = [
  "UNSUPPORTED_COMMAND",
  "PERMISSION_DENIED",
  "INVALID_ARGUMENT",
  "CONTEXT_UNAVAILABLE",
  "NOT_FOUND",
  "CONFLICT",
  "CANCELLED",
  "UNAVAILABLE",
  "EXECUTION_FAILED",
] as const;
export type CommandErrorCode = (typeof ERROR_CODES)[number];
export function commandError(
  code: CommandErrorCode,
  message: string,
  suggestions: string[] = [],
  retryable = false,
) {
  return { ok: false as const, code, message, suggestions, retryable };
}
type Argument = {
  name: string;
  values?: string[];
  pattern?: string;
  optional?: boolean;
};
type Command = {
  command: string;
  args: Argument[];
  permission: string;
  description: string;
  example: string[];
};
const enumArg = (name: string, values: string[]): Argument => ({
  name,
  values,
});
const pathArg = { name: "path" };
const direction = enumArg("direction", ["left", "right", "up", "down"]);
const workspace = { name: "workspace", pattern: "^[1-9]$" };
const command = (
  name: string,
  args: Argument[],
  permission: string,
  description: string,
  example: string[],
): Command => ({
  command: name,
  args,
  permission,
  description,
  example: [name, ...example],
});
export const DESKTOP_COMMANDS: Command[] = [
  ...["capabilities", "inspect", "help", "apps", "version"].map((name) =>
    command(
      name,
      [],
      "desktop.read",
      (
        {
          capabilities: "Machine-readable agent contract",
          inspect: "Current desktop layout and live agent connection metadata",
          help: "Human-readable command help",
          apps: "Installed native app metadata",
          version: "Desktop version",
        } as Record<string, string>
      )[name],
      [],
    ),
  ),
  command(
    "ws",
    [{ ...workspace, optional: true }],
    "desktop.control",
    "Inspect or switch workspace",
    ["2"],
  ),
  command(
    "launch",
    [enumArg("app", Object.keys(apps)), { ...pathArg, optional: true }],
    "apps.launch",
    "Launch a native app; optional declared document path",
    ["editor", "/home/guest/Projects/example.md"],
  ),
  command(
    "open",
    [pathArg],
    "apps.launch",
    "Open an existing file in its associated native app",
    ["/home/guest/Projects/example.md"],
  ),
  ...["focus", "swap"].map((name) =>
    command(
      name,
      [direction],
      "desktop.control",
      "Move focus or swap along a layout direction",
      ["right"],
    ),
  ),
  command("theme", [], "desktop.read", "Read active available theme", []),
  command(
    "theme",
    [enumArg("action", ["list"])],
    "desktop.read",
    "List themes",
    ["list"],
  ),
  command(
    "theme",
    [enumArg("action", ["set"]), enumArg("theme", ["tokyo-night"])],
    "settings.theme",
    "Select supported theme",
    ["set", "tokyo-night"],
  ),
  command(
    "window",
    [enumArg("action", ["list"])],
    "desktop.read",
    "List native windows",
    ["list"],
  ),
  command(
    "window",
    [enumArg("action", ["fullscreen", "grow", "shrink"])],
    "desktop.control",
    "Change focused window layout",
    ["grow"],
  ),
  command(
    "window",
    [enumArg("action", ["move"]), workspace],
    "desktop.control",
    "Move focused window to another workspace",
    ["move", "2"],
  ),
  command(
    "browse",
    [{ name: "url", optional: true }],
    "browser.navigate",
    "Open the OS browser; success means launch, not completed page load",
    ["https://example.com"],
  ),
  command(
    "run",
    [pathArg],
    "browser.navigate",
    "Launch a local HTML file in the OS browser sandbox",
    ["/home/guest/Projects/interval.html"],
  ),
];
export function commandSchema(spec: Command) {
  return {
    type: "array",
    minItems: 1 + spec.args.filter((arg) => !arg.optional).length,
    maxItems: 1 + spec.args.length,
    items: [
      { const: spec.command },
      ...spec.args.map((arg) => ({
        type: "string",
        minLength: 1,
        maxLength: 4096,
        ...(arg.values ? { enum: arg.values } : {}),
        ...(arg.pattern ? { pattern: arg.pattern } : {}),
        description: arg.name,
      })),
    ],
    additionalItems: false,
  };
}
export const commandResultSchema = {
  oneOf: [
    {
      type: "object",
      required: ["ok", "message"],
      properties: {
        ok: { const: true },
        message: { type: "string" },
        data: {},
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["ok", "code", "message", "suggestions", "retryable"],
      properties: {
        ok: { const: false },
        code: { enum: ERROR_CODES },
        message: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
        retryable: { type: "boolean" },
      },
      additionalProperties: false,
    },
  ],
};
export function agentCapabilities(toolsEnabled = true) {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    transport: {
      builtIn: "AI SDK desktop tool; argv excludes the oma prefix",
      webMCP: false,
      httpMCP: false,
    },
    toolsEnabled,
    commands: DESKTOP_COMMANDS.map((spec) => ({
      ...spec,
      inputSchema: commandSchema(spec),
      returnSchema: commandResultSchema,
      errorCodes: ERROR_CODES,
      enabled: toolsEnabled,
    })),
    permissions: [
      { id: "desktop.read", approval: "none" },
      { id: "desktop.control", approval: "none" },
      { id: "apps.launch", approval: "none" },
      { id: "settings.theme", approval: "none" },
      { id: "browser.navigate", approval: "none" },
      {
        id: "filesystem.read",
        approval: "none",
        scope: ["/home/guest", "/.oma except private agent/auth directories"],
      },
      {
        id: "filesystem.create",
        approval: "none",
        scope: ["same scoped filesystem; create-only atomic writes"],
      },
      {
        id: "filesystem.replace",
        approval: "per existing-file change; exact before/after preview",
      },
      {
        id: "shell.read",
        approval: "none",
        scope: ["enforced read-only filesystem; no network or desktop bridge"],
      },
    ].map((permission) => ({ ...permission, enabled: toolsEnabled })),
    revocation:
      "Agent Settings → Allow desktop tools disables all model tools for subsequent turns. Stop the current run first to cancel in-flight work. Fine-grained per-capability revocation is not implemented.",
    unsupported: [
      "event subscriptions",
      "app selections or unsaved buffers",
      "per-app action adapters",
      "agent Python/SQL execution",
      "browser DOM or page text extraction",
      "filesystem deletion",
      "desktop reset",
      "model-controlled approvals",
      "agent handoff",
    ],
  };
}
export function validateAgentCommand(argv: string[]) {
  const cmd = argv[0];
  const variants = DESKTOP_COMMANDS.filter((spec) => spec.command === cmd);
  if (!variants.length)
    return commandError(
      ["reset", "close", "fs", "snapshot", "agent"].includes(cmd)
        ? "PERMISSION_DENIED"
        : "UNSUPPORTED_COMMAND",
      `Command ${JSON.stringify(cmd ?? "")} is not available through the agent desktop tool.`,
      [
        cmd === "fs"
          ? "Use the scoped filesystem tool; existing-file changes require approval."
          : "Call capabilities for supported commands and examples.",
      ],
    );
  const valid = variants.some(
    (spec) =>
      argv.length >= 1 + spec.args.filter((arg) => !arg.optional).length &&
      argv.length <= spec.args.length + 1 &&
      spec.args.every((arg, i) => {
        const value = argv[i + 1];
        return value === undefined
          ? !!arg.optional
          : typeof value === "string" &&
              value.length > 0 &&
              value.length <= 4096 &&
              (!arg.values || arg.values.includes(value)) &&
              (!arg.pattern || new RegExp(arg.pattern).test(value));
      }),
  );
  if (!valid)
    return commandError(
      "INVALID_ARGUMENT",
      `Invalid arguments for ${cmd}.`,
      variants.map((spec) => `Example argv: ${JSON.stringify(spec.example)}`),
    );
  return null;
}
export type InspectState = {
  workspace: number;
  workspaces: Record<
    number,
    { layout: LayoutNode | null; focus: string | null }
  >;
  tiles: Record<string, { app: string; title: string; path?: string }>;
  fullscreen: string | null;
  dirty: Record<string, boolean>;
  agentStatus: string;
};
export function inspectDesktop(
  state: InspectState,
  config: { mode: "chatgpt" | "direct"; model: string; tools: boolean },
) {
  const workspaces = Object.entries(state.workspaces).map(([id, ws]) => ({
    id: Number(id),
    focusedWindow: ws.focus,
    windowIds: geometry(ws.layout).map((rect) => rect.id),
  }));
  const windows = Object.entries(state.workspaces).flatMap(([workspace, ws]) =>
    geometry(ws.layout).flatMap((rect) => {
      const tile = state.tiles[rect.id];
      if (!tile) return [];
      return [
        {
          id: rect.id,
          app: tile.app,
          title: tile.title,
          workspace: Number(workspace),
          focused: ws.focus === rect.id,
          visible:
            Number(workspace) === state.workspace &&
            (!state.fullscreen || state.fullscreen === rect.id),
          fullscreen: state.fullscreen === rect.id,
          layoutBounds: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
          declaredPath: tile.path ?? null,
          pendingSave: !!state.dirty[rect.id],
          appState: null,
          selection: null,
        },
      ];
    }),
  );
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    workspace: state.workspace,
    focusedWindow: state.workspaces[state.workspace]?.focus ?? null,
    fullscreenWindow: state.fullscreen,
    workspaces,
    windows,
    agent: {
      status: state.agentStatus,
      mode: config.mode,
      modelSelected: !!config.model,
      toolsEnabled: config.tools,
    },
    limitations: [
      "layoutBounds are normalized binary-tree coordinates, not rendered pixels; responsive stacking/fullscreen can change rendered bounds",
      "declaredPath is the window launch path, not guaranteed current in-app document or browser URL",
      "appState and selection are unavailable; inspect saved files through the filesystem tool",
      "legacy /.oma/config.toml default_agent is not live connection state",
    ],
  };
}
export type DesktopInspection = ReturnType<typeof inspectDesktop>;
export function commandFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (name === "NotFoundError")
    return commandError("NOT_FOUND", message, [
      "List the containing directory and use an existing path.",
    ]);
  if (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    name === "AgentScopeError"
  )
    return commandError("PERMISSION_DENIED", message, [
      "Check browser storage permissions and the agent filesystem scope.",
    ]);
  return commandError("EXECUTION_FAILED", message, [
    "Inspect desktop state or read the current file before choosing another action.",
  ]);
}
