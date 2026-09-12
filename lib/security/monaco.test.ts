import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import {
  patchMonacoBundle,
  patchMonacoSecurity,
  MONACO_BUNDLE,
  MONACO_SHA256,
  PURIFY_SHA256,
} from "../../scripts/patch-monaco-security.mjs";
let prepared:
  Promise<Awaited<ReturnType<typeof patchMonacoBundle>>> | undefined;
const sources = () =>
  Promise.all([
    readFile(`node_modules/monaco-editor/min/vs/${MONACO_BUNDLE}`, "utf8"),
    readFile("node_modules/dompurify/dist/purify.es.mjs", "utf8"),
  ]);
function patch() {
  return (prepared ??= sources().then(([bundle, purifier]) =>
    patchMonacoBundle(bundle, purifier),
  ));
}
test("Monaco sanitizer patch parses complete AMD output and changes actual factory version", async () => {
  const { output, oldFactory, newFactory } = await patch();
  // Execute only isolated reviewed sanitizer factories, never Monaco's bundle.
  const old = runInNewContext(`(${oldFactory})`)({});
  const factory = runInNewContext(`(${newFactory})`);
  const current = factory({});
  assert.equal(old.version, "3.4.8");
  assert.equal(current.version, "3.4.15");
  assert.equal(typeof current, "function");
  assert.equal(current.isSupported, false);
  assert.equal(factory().version, "3.4.15");
  assert.equal(current({}).version, "3.4.15");
  assert.equal(output.includes("3.4.8"), false);
  assert.ok(output.includes("DOMPurify 3.4.15"));
});
test("Monaco patch refuses unexpected upstream or sanitizer bytes", async () => {
  const [bundle, purifier] = await sources();
  assert.throws(
    () => patchMonacoBundle(bundle + " ", purifier),
    /fingerprint changed/,
  );
  assert.throws(
    () => patchMonacoBundle(bundle, purifier + " "),
    /fingerprint changed/,
  );
});
test("Monaco preparation patches only output and records reproducible provenance", async (t) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "oma-monaco-test-"));
  t.after(() => rm(outputDirectory, { recursive: true, force: true }));
  const result = await patchMonacoSecurity({
    projectRoot: process.cwd(),
    outputDirectory,
  });
  const metadata = JSON.parse(
    await readFile(join(outputDirectory, "oma-security-patch.json"), "utf8"),
  );
  assert.equal(metadata.sourceSHA256, MONACO_SHA256);
  assert.equal(metadata.dompurifySHA256, PURIFY_SHA256);
  assert.equal(metadata.outputSHA256, result.sha256);
  const original = await readFile(
    `node_modules/monaco-editor/min/vs/${MONACO_BUNDLE}`,
    "utf8",
  );
  assert.ok(original.includes("3.4.8"));
  const repeated = await patchMonacoSecurity({
    projectRoot: process.cwd(),
    outputDirectory,
  });
  assert.equal(repeated.sha256, result.sha256);
});
