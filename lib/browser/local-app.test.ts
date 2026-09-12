import { test } from "node:test";
import assert from "node:assert/strict";
import { localAssetPath } from "./local-app";
test("packaged app resolves sibling and nested static assets", () => {
  assert.equal(
    localAssetPath(
      "style.css",
      "/home/guest/Projects/demo/index.html",
      "/home/guest/Projects/demo",
    ),
    "/home/guest/Projects/demo/style.css",
  );
  assert.equal(
    localAssetPath(
      "../images/a.png",
      "/home/guest/Projects/demo/css/style.css",
      "/home/guest/Projects/demo",
    ),
    "/home/guest/Projects/demo/images/a.png",
  );
  assert.equal(
    localAssetPath(
      "app.js?v=2",
      "/home/guest/Projects/demo/index.html",
      "/home/guest/Projects/demo",
    ),
    "/home/guest/Projects/demo/app.js",
  );
});
test("packaged apps cannot read outside their directory or load arbitrary private files", () => {
  for (const ref of [
    "../secret.js",
    "/home/guest/private.css",
    "../../.oma/config.toml",
    "data.json",
    ".env",
    "../demo-evil/main.js",
  ])
    assert.throws(() =>
      localAssetPath(
        ref,
        "/home/guest/Projects/demo/index.html",
        "/home/guest/Projects/demo",
      ),
    );
});
test("absolute remote and embedded assets do not invoke filesystem reads", () => {
  for (const ref of [
    "https://example.com/a.js",
    "data:image/png;base64,a",
    "blob:https://example.com/id",
    "//cdn.example.com/a.js",
    "#pattern",
  ])
    assert.equal(
      localAssetPath(
        ref,
        "/home/guest/Projects/demo/index.html",
        "/home/guest/Projects/demo",
      ),
      null,
    );
});

test("local download anchors preserve native Blob export while ordinary links stay inside OS", async () => {
  const { runInNewContext } = await import("node:vm");
  const { localNavigationBridge } = await import("./local-app");
  let handler: ((event: unknown) => void) | undefined;
  const messages: unknown[] = [];
  runInNewContext(
    localNavigationBridge("/home/guest/Projects/demo/index.html").replace(
      /^<script>|<\/script>$/g,
      "",
    ),
    {
      URL,
      addEventListener: (_name: string, fn: (event: unknown) => void) => {
        handler = fn;
      },
      parent: { postMessage: (value: unknown) => messages.push(value) },
    },
  );
  let prevented = false;
  const event = (download: boolean, href: string) => ({
    target: {
      closest: () => ({
        getAttribute: () => href,
        hasAttribute: (name: string) => name === "download" && download,
        target: "",
      }),
    },
    preventDefault: () => {
      prevented = true;
    },
    ctrlKey: false,
    metaKey: false,
  });
  handler!(event(true, "blob:https://oma.test/export"));
  assert.equal(prevented, false);
  assert.equal(messages.length, 0);
  handler!(event(false, "next.html"));
  assert.equal(prevented, true);
  assert.equal(messages.length, 1);
  assert.equal(
    (messages[0] as { url: string }).url,
    "/home/guest/Projects/demo/next.html",
  );
});
