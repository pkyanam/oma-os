import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";
test("SQL boots and restores saved state with the raw data download blocked", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await context.route("**/pglite/pglite.data", (route) => route.abort());
  await boot(page);
  expect(requests.filter((url) => url.includes("/pglite/"))).toHaveLength(0);
  await page.keyboard.press("Alt+2");
  const app = await launch(page, "SQL Workbench");
  await expect(
    app.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  expect(
    requests.some((url) => url.endsWith("/pglite/pglite.data.meta.json")),
  ).toBe(true);
  expect(requests.some((url) => url.endsWith("/pglite/pglite.data.gz"))).toBe(
    true,
  );
  expect(requests.some((url) => url.endsWith("/pglite/pglite.data"))).toBe(
    false,
  );
  await app
    .getByRole("textbox", { name: "SQL editor" })
    .fill(
      "CREATE TABLE compressed_delivery (answer INT); INSERT INTO compressed_delivery VALUES (42); SELECT answer FROM compressed_delivery;",
    );
  await app.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(
    app.getByRole("cell", { name: "42", exact: true }),
  ).toBeVisible();
  await expect(
    app.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const restored = page.getByRole("region", {
    name: "SQL Workbench window",
    exact: true,
  });
  await expect(
    restored.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await restored
    .getByRole("textbox", { name: "SQL editor" })
    .fill("SELECT answer FROM compressed_delivery;");
  await restored.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(
    restored.getByRole("cell", { name: "42", exact: true }),
  ).toBeVisible();
  expect(requests.some((url) => url.endsWith("/pglite/pglite.data"))).toBe(
    false,
  );
});
test("SQL retains its raw asset fallback when compressed transport is unavailable", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await context.route("**/pglite/pglite.data.gz", (route) => route.abort());
  await boot(page);
  const app = await launch(page, "SQL Workbench");
  await expect(
    app.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  expect(requests.some((url) => url.endsWith("/pglite/pglite.data"))).toBe(
    true,
  );
});
