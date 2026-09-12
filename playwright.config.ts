import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.OMA_BASE_URL || "http://localhost:3017",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.OMA_BASE_URL ? undefined : {
    command: "npm run dev",
    url: "http://localhost:3017/api/health",
    reuseExistingServer: true,
  },
});
