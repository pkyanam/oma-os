import { test, expect } from "@playwright/test";
import { boot, launch, shell } from "./helpers";

test("desktop shortcuts, shell help, pipelines and window exit are wired", async ({
  page,
}) => {
  await boot(page);
  await page.keyboard.press("Alt+k");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+Enter");
  const terminals = page.getByRole("region", {
    name: "Terminal window",
    exact: true,
  });
  await expect(terminals).toHaveCount(2);
  const terminal = terminals.last();
  await shell(terminal, "help", "Desktop command reference");
  await expect(terminal).toContainText("quit / exit");
  await shell(
    terminal,
    `printf '{"items":[{"name":"Beta"},{"name":"Alpha"}]}' | jq -r '.items[].name' | sort`,
    /Alpha\s+Beta/,
  );
  await shell(terminal, "oma version", "oma.os 0.1.0");
  await page.keyboard.press("Alt+2");
  await page.keyboard.press("Alt+1");
  await expect(terminal).toContainText("oma.os 0.1.0");
  await terminal
    .getByRole("textbox", { name: "Terminal input" })
    .pressSequentially("exit");
  await page.keyboard.press("Enter");
  await expect(terminals).toHaveCount(1);
  const remaining = terminals
    .first()
    .getByRole("textbox", { name: "Terminal input" });
  await remaining.pressSequentially("sleep 60");
  await remaining.press("Enter");
  await remaining.press("Control+c");
  await expect(terminals.first()).toContainText(
    "Interrupted. Shell state reset",
  );
  await shell(
    terminals.first(),
    "echo recovered-after-cancel",
    /recovered-after-cancel\s+oma.os/,
  );
  await remaining.pressSequentially("quit");
  await remaining.press("Enter");
  await expect(terminals).toHaveCount(0);
});

test("shell writes persist through reload and open in the real editor", async ({
  page,
}) => {
  await boot(page);
  const terminal = page.getByRole("region", {
    name: "Terminal window",
    exact: true,
  });
  await shell(
    terminal,
    `printf 'persistent-from-shell\\n' > Documents/persistence.txt; cat Documents/persistence.txt`,
    "persistent-from-shell",
  );
  // Confirm output rather than the echoed command before reloading.
  await shell(
    terminal,
    "wc -c Documents/persistence.txt",
    /22\s+Documents\/persistence.txt/,
  );
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Welcome to oma.os" }),
  ).toHaveCount(0);
  await shell(
    terminal,
    "cat Documents/persistence.txt",
    "persistent-from-shell",
  );
  await shell(
    terminal,
    "open Documents/persistence.txt",
    "opened /home/guest/Documents/persistence.txt",
  );
  await expect(
    page
      .locator('[data-app="editor"] .editor-path')
      .filter({ hasText: "persistence.txt" }),
  ).toBeVisible();
});

test("offline agent slash commands and context picker work without paid requests", async ({
  page,
}) => {
  await boot(page);
  const agent = await launch(page, "Agent");
  const input = agent.getByRole("textbox", { name: "Agent command" });
  await input.fill("/help");
  await input.press("Enter");
  await expect(agent).toContainText("/theme <id>");
  await agent.getByRole("button", { name: "Attach context files" }).click();
  await expect(
    agent.getByRole("textbox", { name: "Filter context files" }),
  ).toBeVisible();
  await expect(agent.locator(".agent-context-row").first()).toBeVisible();
  await agent.locator(".agent-context-row").first().click();
  await expect(agent).toContainText("1/4");
  await agent.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    agent.getByRole("textbox", { name: "Agent command" }),
  ).toBeVisible();
});

test("a shell-created HTML app runs inside the OS browser and shares launcher shortcuts", async ({
  page,
  context,
}) => {
  await boot(page);
  const terminal = page.getByRole("region", {
    name: "Terminal window",
    exact: true,
  });
  await shell(
    terminal,
    `printf %s '<!doctype html><button onclick="this.textContent=&quot;It works&quot;">Run local app</button>' > Documents/integration.html; run Documents/integration.html`,
    "opened /home/guest/Documents/integration.html",
  );
  const browser = page.getByRole("region", {
    name: "Browser window",
    exact: true,
  });
  await expect(browser).toBeVisible();
  const local = browser.frameLocator("iframe[data-oma-local]");
  await local
    .getByRole("button", { name: "Run local app", exact: true })
    .click();
  await expect(
    local.getByRole("button", { name: "It works", exact: true }),
  ).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await local
    .getByRole("button", { name: "It works", exact: true })
    .press("Control+Space");
  await expect(page.getByRole("dialog", { name: "Launcher" })).toBeVisible();
});
