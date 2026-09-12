import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  pythonAssetResponse,
  runtimeAsset,
  verifiedRuntimeStream,
  PYODIDE_PREFIX,
} from "./python-assets";
const hash = (data: string) => createHash("sha256").update(data).digest("hex");
function stream(value: string) {
  return new Blob([value]).stream();
}
test("Python gateway only accepts exact pinned release filenames", async () => {
  assert.ok(runtimeAsset(PYODIDE_PREFIX + "pyodide.mjs"));
  assert.ok(
    runtimeAsset(
      PYODIDE_PREFIX + "numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl",
    ),
  );
  for (const suffix of [
    "../secret",
    "pyodide.mjs?url=https://evil.example",
    "pyodide.mjs/other",
    "%70yodide.mjs",
    "missing.whl",
  ])
    assert.equal(runtimeAsset(PYODIDE_PREFIX + suffix), null);
  let fetched = false;
  const response = await pythonAssetResponse(
    new Request(
      "https://oma.example" + PYODIDE_PREFIX + "pyodide.mjs?source=evil",
    ),
    {
      fetcher: async () => {
        fetched = true;
        throw Error("unexpected");
      },
    },
  );
  assert.equal(response.status, 404);
  assert.equal(fetched, false);
});
test("streamed assets enforce hash, size, and incremental byte caps", async () => {
  assert.equal(
    await new Response(
      verifiedRuntimeStream(stream("valid"), {
        sha256: hash("valid"),
        bytes: 5,
      }),
    ).text(),
    "valid",
  );
  await assert.rejects(
    new Response(
      verifiedRuntimeStream(stream("changed"), { sha256: hash("valid") }),
    ).text(),
    /integrity/,
  );
  await assert.rejects(
    new Response(
      verifiedRuntimeStream(stream("valid"), {
        sha256: hash("valid"),
        bytes: 6,
      }),
    ).text(),
    /size/,
  );
  await assert.rejects(
    new Response(
      verifiedRuntimeStream(stream("too big"), { sha256: hash("too big") }, 4),
    ).text(),
    /exceeds/,
  );
});
test("gateway strips credentials, prohibits redirects and rejects oversized upstream bodies", async () => {
  let captured: RequestInit | undefined;
  let destination = "";
  const response = await pythonAssetResponse(
    new Request("https://oma.example" + PYODIDE_PREFIX + "pyodide.mjs", {
      headers: { Cookie: "private=1", Authorization: "Bearer private" },
    }),
    {
      fetcher: async (input, init) => {
        destination = String(input);
        captured = init;
        return new Response("oversized", {
          headers: { "Content-Length": String(26 * 1024 * 1024) },
        });
      },
    },
  );
  assert.equal(response.status, 413);
  assert.equal(
    destination,
    "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs",
  );
  assert.equal(
    Object.hasOwn(captured ?? {}, "credentials"),
    false,
    "Server fetch has no browser cookie jar and Workers does not support credentials",
  );
  assert.equal(captured?.redirect, "manual");
  const headers = new Headers(captured?.headers);
  assert.equal(headers.has("Cookie"), false);
  assert.equal(headers.has("Authorization"), false);
});
test("immutable metadata and conditional responses require no upstream download", async () => {
  const request = new Request(
    "https://oma.example" + PYODIDE_PREFIX + "pyodide.asm.wasm",
    { method: "HEAD" },
  );
  const head = await pythonAssetResponse(request, {
    fetcher: async () => {
      throw Error("Must not fetch");
    },
  });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Content-Type"), "application/wasm");
  assert.match(head.headers.get("Cache-Control")!, /31536000, immutable/);
  const cached = await pythonAssetResponse(
    new Request(request.url, {
      headers: { "If-None-Match": head.headers.get("ETag")! },
    }),
  );
  assert.equal(cached.status, 304);
});
test("an integrity failure cannot finish an edge cache write", async () => {
  let committed = false;
  const pending: Promise<unknown>[] = [];
  const response = await pythonAssetResponse(
    new Request("https://oma.example" + PYODIDE_PREFIX + "pyodide.mjs"),
    {
      fetcher: async () => new Response("modified upstream body"),
      cache: {
        match: async () => undefined,
        put: async (_key, value) => {
          await value.arrayBuffer();
          committed = true;
        },
      },
      waitUntil: (work) => pending.push(work),
    },
  );
  await assert.rejects(response.arrayBuffer(), /size mismatch/);
  await Promise.all(pending);
  assert.equal(committed, false);
});
test("manual upstream redirects are rejected without a second request", async () => {
  let calls = 0;
  const response = await pythonAssetResponse(
    new Request("https://oma.example" + PYODIDE_PREFIX + "pyodide.mjs"),
    {
      fetcher: async (_url, init) => {
        calls++;
        assert.equal(init?.redirect, "manual");
        assert.deepEqual(Object.keys(init!).sort(), [
          "headers",
          "method",
          "redirect",
          "signal",
        ]);
        return new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example/runtime.js" },
        });
      },
    },
  );
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
});
