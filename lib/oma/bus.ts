import { browserTarget } from "@/lib/apps/browser-target";
import { appForPath } from '@/lib/files/kinds';
import { fs, errorMessage } from "@/lib/fs/opfs";
import { seed } from "@/lib/fs/seed";
import { apps, type AppId } from "@/lib/apps/registry";
import type { useDesktop } from "@/lib/state/store";
import type { Direction } from "@/lib/layout/tree";
export type OmaResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; message: string };
export type BusContext = {
  store: Pick<typeof useDesktop, "getState">;
  fs: typeof fs;
  tileId?: string;
  stdin?: string;
};
const help =
  "oma help · version · apps · theme [list|set tokyo-night]\noma ws [1–9] · launch <app> [path] · close\noma focus left|right|up|down · swap left|right|up|down\noma fs ls [path] · read <path> · write <path> <text>\noma window list|fullscreen|grow|shrink|move <1–9>\noma browse [url] · run <HTML path> · open <file>\noma agent status · snapshot list · reset --yes";
export async function oma(argv: string[], ctx: BusContext): Promise<OmaResult> {
  const [cmd = "help", sub, ...rest] = argv,
    s = ctx.store.getState(),
    ok = (message: string, data?: unknown): OmaResult => ({
      ok: true,
      message,
      data,
    }),
    fail = (message: string): OmaResult => ({ ok: false, message });
  try {
    switch (cmd) {
      case "help":
        return ok(help);
      case "version":
        return ok("oma.os 0.1.0");
      case 'apps':
        return ok(Object.values(apps).map(app => `${app.id.padEnd(10)} ${app.title} — ${app.description}`).join('\n'), Object.values(apps));
      case "theme":
        if (!sub || sub === "list") return ok("tokyo-night");
        if (sub === "set") {
          if (rest[0] !== "tokyo-night") return fail("not in v1");
          s.notify("Tokyo Night is active");
          return ok("ok: tokyo-night");
        }
        return fail("usage: oma theme [list|set <id>]");
      case "ws":
        if (sub === undefined)
          return ok(
            `workspace ${s.workspace} · focus ${s.workspaces[s.workspace].focus ?? "none"}`,
          );
        if (!/^[1-9]$/.test(sub)) return fail("workspace must be 1–9");
        s.gotoWs(Number(sub));
        return ok(`workspace ${sub}`);
      case "launch":
        if (!sub || !Object.hasOwn(apps, sub))
          return fail(`usage: oma launch ${Object.keys(apps).join('|')} [path]`);
        s.launch(sub as AppId, rest[0] ? (sub === 'browser' ? browserTarget(rest[0]) : ctx.fs.normalize(rest[0])) : undefined);
        return ok(`opened ${sub}`);
      case 'open': {
        if (!sub) return fail('usage: oma open <file path>');
        const path = ctx.fs.normalize(sub);
        const entry = await ctx.fs.stat(path);
        if (entry.kind === 'directory') { s.launch('files', path); return ok(`opened ${path} in Files`); }
        s.launch(appForPath(path), path);
        return ok(`opened ${path}`);
      }
      case "close": {
        const id = ctx.tileId ?? s.workspaces[s.workspace].focus;
        if (!id) return fail("No focused window");
        if (s.dirty[id])
          return fail("File is still saving. Wait before closing.");
        if (s.tiles[id]?.app === 'agent' && s.agentStatus === 'think')
          return fail('Stop the agent before closing its window.');
        s.closeTile(id);
        return ok("closed");
      }
      case "focus":
      case "swap":
        if (!["left", "right", "up", "down"].includes(sub))
          return fail(`usage: oma ${cmd} left|right|up|down`);
        s.focusDir(sub as Direction, cmd === "swap");
        return ok(`${cmd} ${sub}`);
      case "window":
        if (sub === "list") {
          const windows = Object.entries(s.tiles).map(([id, t]) => ({
            id,
            app: t.app,
            path: t.path,
            workspace: Number(
              Object.keys(s.workspaces).find((n) =>
                JSON.stringify(s.workspaces[Number(n)].layout).includes(id),
              ),
            ),
          }));
          return ok(
            windows
              .map(
                (w) =>
                  `${w.workspace}  ${w.app}  ${w.id}${w.path ? "  " + w.path : ""}`,
              )
              .join("\n"),
            windows,
          );
        }
        if (sub === "fullscreen") {
          s.toggleFullscreen();
          return ok("fullscreen toggled");
        }
        if (sub === "grow" || sub === "shrink") {
          s.grow(sub === "grow" ? 0.05 : -0.05);
          return ok(sub);
        }
        if (sub === "move") {
          const n = Number(rest[0]);
          if (!Number.isInteger(n) || n < 1 || n > 9)
            return fail("workspace must be 1–9");
          s.moveToWs(n);
          return ok(`moved to workspace ${n}`);
        }
        return fail("usage: oma window list|fullscreen|grow|shrink|move <1–9>");
      case "browse":
      case "run":
        if (!sub && cmd === "run") return fail("usage: oma run <HTML path>");
        if (cmd === "run") await ctx.fs.read(sub);
        s.launch(
          "browser",
          sub ? (cmd === "run" ? ctx.fs.normalize(sub) : browserTarget(sub)) : undefined,
        );
        return ok(sub ? `opened ${sub}` : "opened browser");
      case "reset":
        if (sub !== "--yes")
          return fail(
            "Reset deletes all local files. Run oma reset --yes to confirm.",
          );
        if (Object.values(s.dirty).some(Boolean))
          return fail("Wait for pending file saves before resetting.");
        await ctx.fs.reset();
        await seed();
        s.reset();
        s.refreshFs();
        s.setOverlay("welcome");
        return ok("machine reset");
      case "fs":
        if (sub === "ls") {
          const rows = await ctx.fs.ls(rest[0]);
          return ok(
            rows.length
              ? rows
                  .map((r) => r.name + (r.kind === "directory" ? "/" : ""))
                  .join("\n")
              : "(empty)",
            rows,
          );
        }
        if (sub === "read") {
          if (!rest[0]) return fail("usage: oma fs read <path>");
          return ok(await ctx.fs.read(rest[0]));
        }
        if (sub === "write") {
          if (!rest[0]) return fail("usage: oma fs write <path> <text>");
          await ctx.fs.write(rest[0], ctx.stdin ?? rest.slice(1).join(" "));
          s.refreshFs();
          return ok(`saved ${ctx.fs.normalize(rest[0])}`);
        }
        return fail("usage: oma fs ls|read|write");
      case "snapshot":
        return sub === "list"
          ? ok("snapshots: Phase 1.5")
          : fail("usage: oma snapshot list");
      case "agent":
        return sub === "status"
          ? ok(s.agentStatus)
          : fail("usage: oma agent status");
      default:
        return fail(`unknown oma command: ${cmd}`);
    }
  } catch (error) {
    return fail(errorMessage(error));
  }
}
