import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";
const models = [
  "@cf/zai-org/glm-5.3-flash",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/qwen/qwen3.8-27b",
  "@cf/moonshotai/kimi-k2.7-code",
];

test("provider tabs stay independent and Workers AI works without ChatGPT login", async ({
  page,
}) => {
  await page.route("**/api/agent-config", (route) =>
    route.fulfill({
      json: {
        chatgpt: { enabled: true },
        workersAI: { enabled: true, models },
      },
    }),
  );
  await page.route("**/api/chatgpt/session", (route) =>
    route.fulfill({ json: { status: "unauthenticated" } }),
  );
  await boot(page, "/", { workspace: "applications" });
  const app = await launch(page, "Agent");
  await app
    .getByRole("button", { name: "Agent settings", exact: true })
    .click();
  await expect(
    app.getByRole("button", { name: /I trust this app/ }),
  ).toBeVisible();
  await app.getByLabel("Model ID", { exact: true }).fill("gpt-5.6-luna");
  await app.getByRole("button", { name: "Provider key", exact: true }).click();
  await expect(
    app.getByRole("button", { name: /I trust this app/ }),
  ).toHaveCount(0);
  await app.getByLabel("Model ID", { exact: true }).fill("my-provider-model");
  await app.getByRole("button", { name: "Workers AI", exact: true }).click();
  await expect(
    app.getByRole("button", { name: /I trust this app/ }),
  ).toHaveCount(0);
  await expect(app.getByLabel("Model ID").locator("option")).toHaveCount(4);
  await app.getByLabel("Model ID").selectOption(models[2]);
  await app
    .getByRole("button", { name: "ChatGPT account", exact: true })
    .click();
  await expect(app.getByLabel("Model ID")).toHaveValue("gpt-5.6-luna");
  await app.getByRole("button", { name: "Provider key", exact: true }).click();
  await expect(app.getByLabel("Model ID")).toHaveValue("my-provider-model");
  await app.getByRole("button", { name: "Workers AI", exact: true }).click();
  await expect(app.getByLabel("Model ID")).toHaveValue(models[2]);
  await app.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    app.getByRole("button", { name: "Close agent settings" }),
  ).toHaveCount(0);
  await expect(app.locator(".connection-dot.connected")).toBeVisible();
});

test("restored ChatGPT session discovers a model without another login", async ({
  page,
}) => {
  await page.route("**/api/agent-config", (route) =>
    route.fulfill({
      json: {
        chatgpt: { enabled: true },
        workersAI: { enabled: false, models: [] },
      },
    }),
  );
  await page.route("**/api/chatgpt/session", (route) =>
    route.fulfill({
      json: {
        status: "authenticated",
        user: { email: "fixture@example.test" },
      },
    }),
  );
  await page.route("**/api/chatgpt/models", (route) =>
    route.fulfill({ json: { models: [{ slug: "gpt-5.6-luna" }] } }),
  );
  await boot(page, "/", { workspace: "applications" });
  const app = await launch(page, "Agent");
  await app
    .getByRole("button", { name: "Agent settings", exact: true })
    .click();
  await expect(app.getByLabel("Model ID")).toHaveValue("gpt-5.6-luna");
  await expect(
    app.getByRole("button", { name: /I trust this app/ }),
  ).toHaveCount(0);
});

test("live Workers AI completes a desktop tool loop without signing in", async ({
  page,
}) => {
  test.skip(
    process.env.OMA_LIVE_AI !== "1",
    "Explicit opt-in: consumes the deployment's Workers AI allowance",
  );
  test.setTimeout(90_000);
  await boot(page, "/", { workspace: "applications" });
  const app = await launch(page, "Agent");
  await app
    .getByRole("button", { name: "Agent settings", exact: true })
    .click();
  await app.getByRole("button", { name: "Workers AI", exact: true }).click();
  await app
    .getByLabel("Model ID")
    .selectOption("@cf/deepseek-ai/deepseek-v4-flash-0731");
  await app.getByRole("button", { name: "Done", exact: true }).click();
  await app
    .getByRole("textbox", { name: "Agent command", exact: true })
    .fill(
      "Use the desktop tool to inspect the open windows, then tell me their names in one sentence.",
    );
  await app.getByRole("button", { name: "Send command", exact: true }).click();
  const stop = app.getByRole("button", { name: "Stop agent", exact: true });
  await expect(stop).toBeVisible();
  await expect(stop).toHaveCount(0, { timeout: 75_000 });
  await expect(app.locator(".agent-message.tool")).not.toHaveCount(0);
  await expect(app.locator(".agent-transcript")).not.toContainText(
    "Needs attention",
  );
  await expect(
    app.locator(".agent-message.assistant .agent-markdown").last(),
  ).toContainText(/Agent/i);
});

test("ChatGPT rejection shows a readable error and replaces the green light", async ({
  page,
}) => {
  await page.route("**/api/agent-config", (route) =>
    route.fulfill({
      json: {
        chatgpt: { enabled: true },
        workersAI: { enabled: false, models: [] },
      },
    }),
  );
  await page.route("**/api/chatgpt/session", (route) =>
    route.fulfill({ json: { status: "authenticated" } }),
  );
  await page.route("**/api/chatgpt/models", (route) =>
    route.fulfill({ json: { models: [{ slug: "gpt-5.6-luna" }] } }),
  );
  await page.route("**/api/chatgpt/responses", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: "responses_request_failed",
        status: 403,
        detail: "<html><body>Blocked</body></html>",
      },
    }),
  );
  await boot(page, "/", { workspace: "applications" });
  const app = await launch(page, "Agent");
  await app
    .getByRole("button", { name: "Agent settings", exact: true })
    .click();
  await expect(app.getByLabel("Model ID")).toHaveValue("gpt-5.6-luna");
  await app.getByRole("button", { name: "Done", exact: true }).click();
  await app
    .getByRole("textbox", { name: "Agent command", exact: true })
    .fill("Hello");
  await app.getByRole("button", { name: "Send command", exact: true }).click();
  await expect(app.locator(".agent-message.system").last()).toContainText(
    "HTTP 403",
  );
  await expect(app.locator(".agent-message.system").last()).toContainText(
    "OpenAI rejected",
  );
  await expect(app.locator(".connection-dot.failed")).toBeVisible();
  await expect(app.locator(".connection-dot.connected")).toHaveCount(0);
});
