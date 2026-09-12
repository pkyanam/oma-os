import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";

test("Notes saves Markdown and restores the edited note after reload", async ({
  page,
}) => {
  await boot(page);
  const notes = await launch(page, "Notes");
  await page.keyboard.press("Alt+f");
  await notes.getByRole("button", { name: "New note", exact: true }).click();
  await notes
    .getByRole("textbox", { name: "Note title" })
    .fill("Regression notebook");
  const body = notes.getByRole("textbox", { name: "Note body" });
  await body.fill(
    "# A working notebook\n\nThis note survives a browser reload.",
  );
  await body.press("Control+s");
  await expect(notes.locator(".creative-status")).toContainText("Saved");
  await page.reload();
  await expect(notes).toBeVisible();
  await page.keyboard.press("Alt+f");
  await notes.getByRole("button", { name: /Regression notebook/ }).click();
  await expect(notes.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Regression notebook",
  );
  await expect(notes.getByRole("textbox", { name: "Note body" })).toHaveValue(
    "# A working notebook\n\nThis note survives a browser reload.",
  );
  await notes.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    notes.getByRole("heading", { name: "A working notebook" }),
  ).toBeVisible();
});

test("Tasks moves work through columns and persists completion", async ({
  page,
}) => {
  await boot(page);
  const tasks = await launch(page, "Tasks");
  await page.keyboard.press("Alt+f");
  const title = tasks.getByRole("textbox", { name: "New task" });
  await title.fill("Ship regression coverage");
  await expect(
    tasks.getByRole("button", { name: "Add", exact: true }),
  ).toBeEnabled();
  await title.press("Enter");
  await tasks
    .getByRole("button", {
      name: "Start Ship regression coverage",
      exact: true,
    })
    .click();
  await expect(
    tasks.getByRole("region", { name: "In progress", exact: true }),
  ).toContainText("Ship regression coverage");
  await tasks
    .getByRole("button", {
      name: "Complete Ship regression coverage",
      exact: true,
    })
    .click();
  await expect(
    tasks.getByRole("region", { name: "Done", exact: true }),
  ).toContainText("Ship regression coverage");
  await expect(tasks.locator(".tasks-footer")).toContainText("Saved");
  await page.reload();
  await expect(
    tasks.getByRole("region", { name: "Done", exact: true }),
  ).toContainText("Ship regression coverage");
  await tasks.getByRole("button", { name: "Start focus timer" }).click();
  await expect(
    tasks.getByRole("button", { name: "Pause focus timer" }),
  ).toBeVisible();
  await tasks.getByRole("button", { name: "Pause focus timer" }).click();
});
