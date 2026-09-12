import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
const source = readFileSync(
  new URL("../../public/runtime/python-worker.mjs", import.meta.url),
  "utf8",
);
function harness() {
  const output: Record<string, unknown>[] = [];
  let read: (event: unknown) => void = () => {};
  const self = {
    location: { origin: "https://oma.example" },
    postMessage: (value: Record<string, unknown>) => output.push(value),
    addEventListener: (_type: string, callback: typeof read) => {
      read = callback;
    },
  };
  const context = createContext({ self, URL });
  new Script(source).runInContext(context);
  return {
    output,
    context,
    read: (name: string) => read({ data: { type: "read", name } }),
  };
}
test("Python worker reports read requests before initialization instead of hanging", () => {
  const h = harness();
  h.read("report.csv");
  assert.equal(h.output[0].type, "read-error");
  assert.match(String(h.output[0].text), /not initialized/);
});
test("Python worker rejects busy exports and invalid filenames with a terminal response", () => {
  const h = harness();
  new Script("runtime={};running=true").runInContext(h.context);
  h.read("report.csv");
  assert.equal(h.output[0].type, "read-error");
  assert.match(String(h.output[0].text), /running/);
  new Script("running=false").runInContext(h.context);
  h.read("../private");
  assert.equal(h.output[1].type, "read-error");
  assert.match(String(h.output[1].text), /Invalid/);
});
test("Python worker exports unicode names and converts read failures to errors", () => {
  const h = harness();
  new Script(
    'runtime={FS:{stat:()=>({mode:1,size:4}),isFile:()=>true,readFile:()=>"text"}}',
  ).runInContext(h.context);
  h.read("résumé.csv");
  assert.equal(h.output[0].type, "file");
  assert.equal(h.output[0].name, "résumé.csv");
  new Script(
    'runtime.FS.readFile=()=>{throw new Error("removed")};',
  ).runInContext(h.context);
  h.read("gone.txt");
  assert.equal(h.output[1].type, "read-error");
  assert.match(String(h.output[1].text), /removed/);
});
