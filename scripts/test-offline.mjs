import { createServer } from "node:net";
import { spawn } from "node:child_process";
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["e2e/offline-server.mjs"], {
  stdio: "inherit",
  env: { ...process.env, OMA_OFFLINE_PORT: String(port) },
});
let tests;
const stop = () => {
  tests?.kill("SIGTERM");
  server.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      const response = await fetch(base + "/oma-sw.js");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready)
    throw new Error("Build Cloudflare first: npm run build:cloudflare");
  tests = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "e2e/offline.spec.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        OMA_BASE_URL: base,
        OMA_OFFLINE_TEST_URL: base,
        OMA_OFFLINE_FIXTURE: "1",
      },
    },
  );
  process.exitCode = await new Promise((resolve) => {
    tests.once("error", () => resolve(1));
    tests.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  server.kill("SIGTERM");
}
