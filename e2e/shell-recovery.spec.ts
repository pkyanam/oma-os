import { test, expect } from "@playwright/test";
import { boot, launch, shell } from "./helpers";

test("Terminal settles a failed worker start and executes the next command", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    let failed = false;
    globalThis.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!failed && String(url).includes("shell.worker")) {
          failed = true;
          throw new Error("Simulated blocked worker startup");
        }
        super(url, options);
      }
    };
  });
  await boot(page);
  const terminal = await launch(page, "Terminal");
  await shell(terminal, "echo first", "Shell worker could not start");
  await expect(terminal.locator(".terminal-shell")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    terminal.getByRole("button", { name: "Stop terminal command" }),
  ).toBeHidden();
  await shell(terminal, "printf 'recovered-%s\\n' worker", "recovered-worker");
  await expect(terminal.locator(".terminal-shell")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});
