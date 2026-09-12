import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryFs } from "just-bash";
import { createShellEngine } from "./engine";
const desktop = async () => ({ stdout: "desktop\n", stderr: "", exitCode: 0 });
async function fixture() {
  const fs = new InMemoryFs({
    "/home/guest/data.json": '{"items":[{"name":"Beta"},{"name":"Alpha"}]}',
    "/home/guest/readme.md": "TODO first\nDone second\nTODO third\n",
  });
  const engine = createShellEngine(fs, desktop);
  return { fs, engine };
}
test("real JSON and text pipelines run over shared files", async () => {
  const { engine } = await fixture();
  const json = await engine.execute(
    "cat data.json | jq -r '.items[].name' | sort",
  );
  assert.equal(json.exitCode, 0);
  assert.equal(json.stdout, "Alpha\nBeta\n");
  const text = await engine.execute(
    "grep TODO readme.md | sed 's/TODO/DONE/' | wc -l",
  );
  assert.equal(text.exitCode, 0);
  assert.equal(text.stdout.trim(), "2");
});
test("redirects, find and subsequent executions share files and cwd", async () => {
  const { engine, fs } = await fixture();
  assert.equal(
    (
      await engine.execute(
        "mkdir report; cd report; printf 'hello\\n' > greeting.txt; export NAME=oma",
      )
    ).exitCode,
    0,
  );
  assert.equal(engine.cwd, "/home/guest/report");
  assert.equal(
    (await engine.execute("cat greeting.txt; echo $NAME")).stdout,
    "hello\noma\n",
  );
  assert.equal(await fs.readFile("/home/guest/report/greeting.txt"), "hello\n");
  assert.match(
    (await engine.execute("find .. -name '*.txt'")).stdout,
    /greeting.txt/,
  );
});
test("desktop commands receive expanded args, cwd and decoded pipeline input", async () => {
  const { fs } = await fixture();
  let call: unknown;
  const engine = createShellEngine(fs, async (...args) => {
    call = args;
    return desktop();
  });
  const result = await engine.execute(
    "printf 'café' | oma fs write 'note with spaces.md'",
  );
  assert.equal(result.exitCode, 0);
  assert.deepEqual(call, [
    "oma",
    ["fs", "write", "note with spaces.md"],
    "/home/guest",
    "café",
  ]);
});
test("network and native execution are unavailable", async () => {
  const { engine } = await fixture();
  assert.equal(
    (await engine.execute("curl https://example.com")).exitCode,
    126,
  );
  assert.notEqual(
    (await engine.execute("node -e 'process.exit()'")).exitCode,
    0,
  );
});
test("plain help combines shell and desktop help while named help stays built-in", async () => {
  const { engine } = await fixture();
  const result = await engine.execute("help");
  assert.match(result.stdout, /Just Bash/);
  assert.match(result.stdout, /oma help/);
  assert.match(result.stdout, /quit \/ exit/);
  assert.match(result.stdout, /Desktop command reference\ndesktop/);
  const builtin = await engine.execute("help cd");
  assert.equal(builtin.exitCode, 0);
  assert.match(builtin.stdout, /cd/);
  assert.doesNotMatch(builtin.stdout, /Desktop command reference/);
});
test("runaway loops hit execution limits", async () => {
  const { engine } = await fixture();
  const result = await engine.execute("while true; do :; done");
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /limit|maximum|exceeded/i);
});
