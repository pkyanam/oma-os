import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryFs } from "just-bash";
import { createAgentShell } from "./shell-engine";
import { ReadOnlyAgentFs } from "./read-only-fs";
function fixture() {
  return new InMemoryFs({
    "/home/guest/data.csv": "name,value\nA,1\nB,2\n",
    "/home/guest/notes.txt": "one\ntwo\nthree\n",
    "/.oma/config.toml": 'theme="tokyo-night"',
    "/.oma/conversations/private.json": "secret transcript",
    "/.oma/auth/token": "secret token",
    "/etc/private": "host secret",
  });
}
test("agent shell runs real read-only pipelines over scoped files", async () => {
  const result = await createAgentShell(fixture()).exec(
    "cat notes.txt | grep -v two | sort -r",
    { rawScript: true },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "three\none\n");
});
test("redirection, command substitution, sed -i and destructive commands cannot mutate files", async () => {
  const source = fixture(),
    shell = createAgentShell(source);
  for (const script of [
    "echo changed > notes.txt",
    "echo changed >> notes.txt",
    "sed -i 's/one/changed/' notes.txt",
    "rm notes.txt",
    "mv notes.txt moved.txt",
    "cp notes.txt copied.txt",
    "mkdir newdir",
    'p=notes.txt; printf changed > "$p"',
    "touch notes.txt",
  ]) {
    const result = await shell
      .exec(script, { rawScript: true })
      .catch((error) => ({ exitCode: 1, stderr: String(error) }));
    assert.notEqual(result.exitCode, 0, script);
    assert.equal(
      await source.readFile("/home/guest/notes.txt"),
      "one\ntwo\nthree\n",
      script,
    );
  }
  assert.equal(await source.exists("/home/guest/copied.txt"), false);
});
test("private archives and out-of-scope paths cannot be read or discovered", async () => {
  const shell = createAgentShell(fixture());
  for (const path of [
    "/.oma/conversations/private.json",
    "/.oma/auth/token",
    "/etc/private",
    "../../etc/private",
  ]) {
    const result = await shell.exec(`cat '${path}'`, { rawScript: true });
    assert.notEqual(result.exitCode, 0);
    assert.ok(!result.stdout.includes("secret"));
  }
  const listed = await shell.exec("ls -a /.oma", { rawScript: true });
  assert.ok(listed.stdout.includes("config.toml"));
  assert.ok(!listed.stdout.includes("conversations"));
  assert.ok(!listed.stdout.includes("auth"));
});
test("no custom desktop bus or network command can bypass filesystem boundary", async () => {
  const shell = createAgentShell(fixture());
  for (const script of [
    "oma reset --yes",
    "edit notes.txt",
    "open https://example.com",
    "curl https://example.com",
    "wget https://example.com",
    'node -e "console.log(1)"',
  ]) {
    const result = await shell.exec(script, { rawScript: true });
    assert.notEqual(result.exitCode, 0, script);
  }
});
test("symlinks cannot redirect an otherwise allowed path into private data", async () => {
  const source = fixture();
  await source.symlink("/.oma/conversations", "/home/guest/shortcut");
  const readonly = new ReadOnlyAgentFs(source);
  await assert.rejects(
    readonly.readFile("/home/guest/shortcut/private.json"),
    /symbolic links/,
  );
});
