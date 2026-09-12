import test from "node:test";
import assert from "node:assert/strict";
import {
  agentCapabilities,
  inspectDesktop,
  validateAgentCommand,
  DESKTOP_COMMANDS,
  type InspectState,
} from "./agent-contract";
import { apps } from "../apps/registry";
test("every advertised command example validates and all registered applications are launchable", () => {
  for (const command of DESKTOP_COMMANDS)
    assert.equal(
      validateAgentCommand(command.example),
      null,
      JSON.stringify(command.example),
    );
  for (const id of Object.keys(apps))
    assert.equal(validateAgentCommand(["launch", id]), null);
  const contract = agentCapabilities(false);
  assert.ok(
    contract.commands.every(
      (c) =>
        c.inputSchema &&
        c.returnSchema &&
        c.errorCodes.length &&
        c.permission &&
        !c.enabled,
    ),
  );
  assert.ok(contract.permissions.every((p) => !p.enabled));
  assert.equal(contract.transport.httpMCP, false);
});
test("command validation separates denied, unknown and malformed calls before dispatch", () => {
  assert.equal(
    validateAgentCommand(["reset", "--yes"])?.code,
    "PERMISSION_DENIED",
  );
  assert.equal(
    validateAgentCommand(["sudo", "rm"])?.code,
    "UNSUPPORTED_COMMAND",
  );
  for (const args of [
    ["ws", "0"],
    ["ws", "2", "ignored"],
    ["launch", "__proto__"],
    ["focus", "sideways"],
    ["window", "move", "10"],
    ["open", ""],
    ["theme", "set", "unknown"],
  ])
    assert.equal(validateAgentCommand(args)?.code, "INVALID_ARGUMENT");
});
test("inspection reports each workspace, focus and normalized geometry without app internals or credentials", () => {
  const state: InspectState = {
    workspace: 2,
    fullscreen: "b",
    dirty: { b: true },
    agentStatus: "think",
    tiles: {
      a: { app: "editor", title: "Editor", path: "/home/guest/a.md" },
      b: { app: "files", title: "Files" },
    },
    workspaces: {
      1: { layout: { type: "leaf", id: "a" }, focus: "a" },
      2: { layout: { type: "leaf", id: "b" }, focus: "b" },
    },
  };
  const output = inspectDesktop(state, {
    mode: "direct",
    model: "model",
    tools: true,
    apiKey: "secret",
    baseURL: "https://sensitive.example",
  } as Parameters<typeof inspectDesktop>[1]);
  assert.equal(output.workspace, 2);
  assert.equal(output.focusedWindow, "b");
  assert.deepEqual(output.windows[0].layoutBounds, {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.equal(output.windows[0].visible, false);
  assert.equal(output.windows[1].visible, true);
  assert.equal(output.windows[1].pendingSave, true);
  assert.equal(output.windows[0].selection, null);
  assert.ok(!JSON.stringify(output).includes("secret"));
  assert.ok(!JSON.stringify(output).includes("sensitive.example"));
  state.workspaces[2].layout = null;
  state.workspaces[2].focus = null;
  assert.equal(
    inspectDesktop(state, { mode: "chatgpt", model: "", tools: false })
      .focusedWindow,
    null,
  );
});
