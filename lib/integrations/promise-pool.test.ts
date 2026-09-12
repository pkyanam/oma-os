import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { commonJSPromisePool } from "../../scripts/patch-promise-pool.mjs";

test("bundled PromisePool exports its constructor even when Monaco AMD is present", async () => {
  const source = await readFile(
    new URL(
      "../../node_modules/es6-promise-pool/es6-promise-pool.js",
      import.meta.url,
    ),
    "utf8",
  );
  const license = await readFile(
    new URL("../../public/licenses/es6-promise-pool.txt", import.meta.url),
    "utf8",
  );
  const output = commonJSPromisePool(source, "2.5.0", license);
  let amdCalls = 0;
  const define = Object.assign(
    () => {
      amdCalls++;
    },
    { amd: {} },
  );
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    define,
    Promise,
  });
  const Pool = module.exports as unknown as new (
    producer: () => Promise<void> | null,
    concurrency: number,
  ) => { start: () => Promise<void> };
  assert.equal(typeof Pool, "function");
  assert.equal(amdCalls, 0);
  let active = 0,
    max = 0,
    completed = 0,
    remaining = 6;
  const pool = new Pool(
    () =>
      remaining-- > 0
        ? new Promise((resolve) => {
            active++;
            max = Math.max(max, active);
            setTimeout(() => {
              active--;
              completed++;
              resolve();
            }, 5);
          })
        : null,
    2,
  );
  await pool.start();
  assert.equal(max, 2);
  assert.equal(completed, 6);
  assert.match(output, /MIT License|Permission is hereby granted/);
  assert.throws(
    () => commonJSPromisePool(source + "\n", "2.5.0", license),
    /source changed/,
  );
  assert.throws(
    () => commonJSPromisePool(source, "3.0.0", license),
    /source changed/,
  );
});
