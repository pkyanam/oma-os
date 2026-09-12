import { defineConfig } from "@playwright/test";
const cloudflare = process.env.OMA_TEST_RUNTIME === "cloudflare";
const localURL = cloudflare ? "http://127.0.0.1:3018" : "http://localhost:3017";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.OMA_BASE_URL || localURL,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.OMA_BASE_URL
    ? undefined
    : {
        command: cloudflare ? "npm run dev:cloudflare" : "npm run dev",
        url: `${localURL}/api/health`,
        reuseExistingServer: true,
      },
});
