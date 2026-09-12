import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { startPublicProxy } from "./proxy";
import { publicDestination } from "./network";
import { GET, POST } from "../../app/api/browser-runtime/route";
test("remote browser rejects private, metadata, and mapped loopback destinations", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "https://[::1]/",
    "http://169.254.169.254/",
    "http://10.0.0.1/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
  ])
    await assert.rejects(() => publicDestination(url), /Private/);
});
test("public proxy blocks private HTTP before opening an upstream socket", async () => {
  const proxy = await startPublicProxy();
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        proxy.url,
        { path: "http://127.0.0.1/", method: "GET" },
        (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  } finally {
    proxy.close();
  }
});
test("public proxy rejects private CONNECT and credentialed tunnel authorities", async () => {
  const proxy = await startPublicProxy(),
    port = Number(new URL(proxy.url).port);
  try {
    for (const target of ["127.0.0.1:443", "user:pass@example.com:443"]) {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () =>
          socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`),
        );
        socket.once("data", (data) => {
          resolve(data.toString());
          socket.destroy();
        });
        socket.on("error", reject);
      });
      assert.match(response, /403 Forbidden/);
    }
  } finally {
    proxy.close();
  }
});
test("browser control rejects cross-origin POST before allocating a session", async () => {
  const response = await POST(
    new Request("http://localhost:3017/api/browser-runtime", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "start", url: "https://example.com" }),
    }),
  );
  assert.equal(response.status, 403);
});
test("browser frames require an owned session cookie", async () => {
  const response = await GET(
    new Request("http://localhost:3017/api/browser-runtime?sessionId=unknown"),
  );
  assert.equal(response.status, 404);
});
test("same-origin detection honors actual Host when Next uses an internal listen address", async () => {
  const response = await POST(
    new Request("http://0.0.0.0:3017/api/browser-runtime", {
      method: "POST",
      headers: {
        host: "localhost:3017",
        origin: "http://localhost:3017",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "close", sessionId: "missing" }),
    }),
  );
  assert.equal(response.status, 404);
});
