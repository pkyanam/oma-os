import test from "node:test";
import assert from "node:assert/strict";
import {
  createDesktopTools,
  desktopToolAllowed,
  exactPatch,
  scopedPath,
  type AgentFileSystem,
} from "./tools";
import { normalize } from "../fs/opfs";
function fixture(
  initial: Record<string, string> = {},
  approve: (
    path: string,
    before: string,
    after: string,
  ) => Promise<boolean> = async () => true,
) {
  const files = new Map(Object.entries(initial));
  let writes = 0,
    refreshes = 0;
  const abort = new AbortController();
  const fs: AgentFileSystem = {
    normalize,
    ls: async (path) =>
      [...files.keys()]
        .filter((name) => name.startsWith(path + "/"))
        .map((path) => ({
          path,
          name: path.split("/").pop()!,
          kind: "file" as const,
        })),
    read: async (path) => {
      if (!files.has(path)) throw new Error("Missing file");
      return files.get(path)!;
    },
    exists: async (path) => files.has(path),
    mkdir: async () => {},
    search: async (path) =>
      [...files.keys()]
        .filter((name) => name.startsWith(path + "/"))
        .map((path) => ({
          path,
          name: path.split("/").pop()!,
          kind: "file" as const,
        })),
    writeBlob: async (path, blob, options) => {
      if (options?.overwrite === false && files.has(path))
        throw new Error("File already exists");
      writes++;
      files.set(path, await blob.text());
    },
    write: async (path, content, expected) => {
      if (expected !== undefined && (files.get(path) ?? "") !== expected)
        throw new Error("File changed on disk");
      writes++;
      files.set(path, content);
    },
  };
  const tools = createDesktopTools({
    fs,
    signal: abort.signal,
    approve,
    refresh: () => {
      refreshes++;
    },
    command: async (argv) => ({ ok: true, argv }),
  });
  const run = (input: {
    action: "read" | "write" | "patch" | "search" | "list" | "mkdir";
    path: string;
    content?: string;
    find?: string;
    query?: string;
  }) =>
    tools.filesystem.execute!(input, {
      toolCallId: "test",
      messages: [],
      context: {},
    });
  return {
    run,
    files,
    tools,
    fs,
    abort,
    get writes() {
      return writes;
    },
    get refreshes() {
      return refreshes;
    },
  };
}
test("normalizes paths before enforcing scope, including traversal", () => {
  assert.equal(
    scopedPath({ normalize }, "Documents/../Projects/a.html"),
    "/home/guest/Projects/a.html",
  );
  assert.throws(
    () => scopedPath({ normalize }, "/home/guest/../../etc/passwd"),
    /outside/,
  );
  assert.throws(
    () => scopedPath({ normalize }, "/.oma/conversations/a.json"),
    /private/,
  );
});
test("exact patches reject ambiguous and missing matches", () => {
  assert.equal(exactPatch("a + b", " + ", " - "), "a - b");
  assert.throws(() => exactPatch("abab", "ab", "x"), /more than once/);
  assert.throws(() => exactPatch("abc", "z", "x"), /not found/);
  assert.throws(() => exactPatch("abc", "", "x"), /must not be empty/);
});
test("declining an overwrite leaves contents unchanged", async () => {
  const f = fixture({ "/home/guest/a.txt": "keep me" }, async () => false);
  assert.deepEqual(
    await f.run({
      action: "write",
      path: "/home/guest/a.txt",
      content: "replacement",
    }),
    {
      ok: false,
      message:
        "User declined the change. Do not retry without new instructions.",
    },
  );
  assert.equal(f.files.get("/home/guest/a.txt"), "keep me");
  assert.equal(f.writes, 0);
  assert.equal(f.refreshes, 0);
});
test("approved edits refuse to overwrite changes made while approval was open", async () => {
  const f = fixture({ "/home/guest/a.txt": "initial" }, async () => {
    f.files.set("/home/guest/a.txt", "edited elsewhere");
    return true;
  });
  assert.deepEqual(
    await f.run({
      action: "write",
      path: "/home/guest/a.txt",
      content: "replacement",
    }),
    { ok: false, message: "File changed on disk" },
  );
  assert.equal(f.files.get("/home/guest/a.txt"), "edited elsewhere");
});
test("abort after approval prevents a filesystem mutation", async () => {
  const f = fixture({ "/home/guest/a.txt": "initial" }, async () => {
    f.abort.abort();
    return true;
  });
  await assert.rejects(
    Promise.resolve(
      f.run({
        action: "write",
        path: "/home/guest/a.txt",
        content: "replacement",
      }),
    ),
    { name: "AbortError" },
  );
  assert.equal(f.writes, 0);
});
test("a patch writes only its exact approved result", async () => {
  const approved: string[] = [];
  const f = fixture(
    { "/home/guest/a.txt": "hello world" },
    async (path, before, after) => {
      approved.push(path, before, after);
      return true;
    },
  );
  assert.deepEqual(
    await f.run({
      action: "patch",
      path: "/home/guest/a.txt",
      find: "world",
      content: "desktop",
    }),
    { ok: true, path: "/home/guest/a.txt", characters: 13, created: false },
  );
  assert.deepEqual(approved, [
    "/home/guest/a.txt",
    "hello world",
    "hello desktop",
  ]);
  assert.equal(f.files.get("/home/guest/a.txt"), "hello desktop");
  assert.equal(f.refreshes, 1);
});
test("bounded reads signal truncation instead of claiming the whole file was read", async () => {
  const f = fixture({ "/home/guest/a.txt": "x".repeat(64001) });
  assert.deepEqual(await f.run({ action: "read", path: "/home/guest/a.txt" }), {
    ok: true,
    path: "/home/guest/a.txt",
    content: "x".repeat(64000),
    truncated: true,
    characters: 64001,
  });
});
test("missing write bodies do not accidentally empty a file", async () => {
  const f = fixture({ "/home/guest/a.txt": "keep" });
  assert.deepEqual(
    await f.run({ action: "write", path: "/home/guest/a.txt" }),
    { ok: false, message: "content is required for writes and patches." },
  );
  assert.equal(f.writes, 0);
});
test("conversation archives are excluded from search results", async () => {
  const f = fixture({
    "/.oma/conversations/a.json": "private",
    "/.oma/config.toml": "public",
  });
  assert.deepEqual(await f.run({ action: "search", path: "/.oma" }), {
    ok: true,
    entries: [{ path: "/.oma/config.toml", name: "config.toml", kind: "file" }],
    note: "Scans at most 300 files; returns at most 50 matches.",
  });
});
test("desktop allowlist excludes resets, deletion and shell commands", async () => {
  for (const argv of [
    ["reset", "--yes"],
    ["fs", "rm", "/home/guest/a"],
    ["window", "close"],
    ["curl", "https://example.com"],
    ["eval", "alert(1)"],
  ])
    assert.equal(desktopToolAllowed(argv), false);
  assert.equal(desktopToolAllowed(["launch", "notes"]), true);
  assert.equal(desktopToolAllowed(["open", "/home/guest/a.md"]), true);
  assert.deepEqual(
    await fixture().tools.desktop.execute!(
      { argv: ["reset", "--yes"] },
      { toolCallId: "test", messages: [], context: {} },
    ),
    {
      ok: false,
      code: "PERMISSION_DENIED",
      message:
        'Command "reset" is not available through the agent desktop tool.',
      suggestions: ["Call capabilities for supported commands and examples."],
      retryable: false,
    },
  );
});

test("new files use create-only writes and never replace a concurrent file", async () => {
  const f = fixture();
  f.fs.exists = async () => {
    f.files.set("/home/guest/new.txt", "concurrent content");
    return false;
  };
  assert.deepEqual(
    await f.run({
      action: "write",
      path: "/home/guest/new.txt",
      content: "agent content",
    }),
    { ok: false, message: "File already exists" },
  );
  assert.equal(f.files.get("/home/guest/new.txt"), "concurrent content");
  assert.equal(f.writes, 0);
});

test("desktop contract rejects malformed and prohibited calls and exposes capabilities", async () => {
  const { tools } = fixture();
  const execute = (argv: string[]) =>
    tools.desktop.execute!(
      { argv },
      { toolCallId: "contract", messages: [], context: {} },
    );
  assert.equal(
    ((await execute(["reset", "--yes"])) as { code: string }).code,
    "PERMISSION_DENIED",
  );
  assert.equal(
    ((await execute(["ws", "99"])) as { code: string }).code,
    "INVALID_ARGUMENT",
  );
  assert.equal(
    ((await execute(["invented"])) as { code: string }).code,
    "UNSUPPORTED_COMMAND",
  );
  assert.equal(
    ((await execute(["inspect"])) as { code: string }).code,
    "UNAVAILABLE",
  );
  const result = (await execute(["capabilities"])) as {
    ok: boolean;
    data: { contractVersion: string };
  };
  assert.equal(result.ok, true);
  assert.equal(result.data.contractVersion, "1.0.0");
});

test("desktop context and path failures never dispatch commands", async () => {
  const f = fixture();
  let dispatched = 0;
  const { inspectDesktop } = await import("../oma/agent-contract");
  const tools = createDesktopTools({
    fs: f.fs,
    signal: f.abort.signal,
    approve: async () => false,
    refresh: () => {},
    command: async () => {
      dispatched++;
      return { ok: true, message: "dispatched" };
    },
    inspect: () =>
      inspectDesktop(
        {
          workspace: 1,
          workspaces: { 1: { layout: null, focus: null } },
          tiles: {},
          fullscreen: null,
          dirty: {},
          agentStatus: "idle",
        },
        { mode: "chatgpt", model: "test", tools: true },
      ),
  });
  const execute = (argv: string[]) =>
    tools.desktop.execute!(
      { argv },
      { toolCallId: "context", messages: [], context: {} },
    );
  assert.equal(
    ((await execute(["window", "grow"])) as { code: string }).code,
    "CONTEXT_UNAVAILABLE",
  );
  assert.equal(
    ((await execute(["open", "/.oma/auth/session.json"])) as { code: string })
      .code,
    "PERMISSION_DENIED",
  );
  assert.equal(
    ((await execute(["run", "/etc/private.html"])) as { code: string }).code,
    "PERMISSION_DENIED",
  );
  assert.equal(dispatched, 0);
  assert.equal(
    ((await execute(["launch", "notes"])) as { ok: boolean }).ok,
    true,
  );
  assert.equal(dispatched, 1);
});
