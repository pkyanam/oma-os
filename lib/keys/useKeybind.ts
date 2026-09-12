"use client";
import { useEffect } from "react";
import { useDesktop } from "@/lib/state/store";
import { oma } from "@/lib/oma/bus";
import { fs } from "@/lib/fs/opfs";
import { ids, type Direction } from "@/lib/layout/tree";
export async function dismissWelcome() {
  try {
    await fs.write("/.oma/seen-welcome", "seen\n");
    useDesktop.getState().setOverlay(null);
  } catch {
    useDesktop.getState().notify("Could not save welcome preference");
  }
}
export function useKeybind() {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const s = useDesktop.getState();
      const bus = (argv: string[]) => {
        void oma(argv, { store: useDesktop, fs });
      };
      const code = e.code,
        key = e.key.toLowerCase(),
        superKey =
          s.modifier === "control-shift" ? e.ctrlKey && e.shiftKey : e.altKey,
        shift = s.modifier === "control-shift" ? e.altKey : e.shiftKey;
      const dir: Record<string, Direction> = {
        KeyH: "left",
        KeyJ: "down",
        KeyK: "up",
        KeyL: "right",
        ArrowLeft: "left",
        ArrowDown: "down",
        ArrowUp: "up",
        ArrowRight: "right",
      };
      const table: [boolean, () => void][] = [
        [e.metaKey && code === "KeyK", () => s.setOverlay("launcher")],
        [e.ctrlKey && code === "Period", () => s.setOverlay("menu")],
        [e.ctrlKey && code === "Backquote", () => s.setOverlay("window")],
        [
          key === "escape" && !!s.overlay,
          () => {
            if (s.overlay === "welcome") void dismissWelcome();
            else s.setOverlay(null);
          },
        ],
        [
          key === "enter" && s.overlay === "welcome",
          () => {
            void dismissWelcome();
          },
        ],
        [
          (superKey || e.ctrlKey) && code === "Space",
          () => s.setOverlay(shift ? "menu" : "launcher"),
        ],
        [superKey && code === "KeyK" && !shift, () => s.setOverlay("keys")],
        [
          superKey && (code === "BracketLeft" || code === "BracketRight"),
          () => {
            const workspace = s.workspaces[s.workspace],
              windows = ids(workspace.layout);
            if (!windows.length) return;
            const current = windows.indexOf(workspace.focus ?? ""),
              offset = code === "BracketRight" ? 1 : -1;
            const next =
              windows[(current + offset + windows.length) % windows.length];
            if (s.fullscreen) s.toggleFullscreen();
            s.focus(next);
          },
        ],
        [
          superKey && /^Digit[1-9]$/.test(code),
          () => {
            const n = Number(code.slice(-1));
            if (shift) s.moveToWs(n);
            else bus(["ws", String(n)]);
          },
        ],
        [superKey && code === "Enter", () => bus(["launch", "term"])],
        [
          superKey && (code === "KeyW" || code === "KeyQ"),
          () => bus(["close"]),
        ],
        [
          superKey && !!dir[code],
          () => bus([shift ? "swap" : "focus", dir[code]]),
        ],
        [superKey && code === "KeyF", () => s.toggleFullscreen()],
        [superKey && code === "KeyA", () => bus(["launch", "agent"])],
        [superKey && code === "KeyE", () => bus(["launch", "editor"])],
        [
          superKey && code === "KeyT",
          () => s.notify("Tokyo Night is the only theme in v1"),
        ],
        [
          superKey && (code === "Equal" || code === "Minus"),
          () => s.grow(code === "Equal" ? 0.05 : -0.05),
        ],
      ];
      const match = table.find(([test]) => test);
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        match[1]();
      }
    };
    const fromLocalApp = (event: MessageEvent) => {
      if (
        !event.data ||
        !["oma:shortcut", "oma:focus"].includes(event.data.type)
      )
        return;
      const frame = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("iframe[data-oma-local]"),
      ).find(
        (f) => f.contentWindow === event.source && document.activeElement === f,
      );
      if (!frame) return;
      const id = frame.closest("[data-tile-id]")?.getAttribute("data-tile-id");
      if (id) useDesktop.getState().focus(id);
      if (
        event.data.type === "oma:shortcut" &&
        typeof event.data.code === "string" &&
        typeof event.data.key === "string"
      )
        handle(
          new KeyboardEvent("keydown", {
            code: event.data.code,
            key: event.data.key,
            altKey: event.data.altKey === true,
            ctrlKey: event.data.ctrlKey === true,
            shiftKey: event.data.shiftKey === true,
            metaKey: event.data.metaKey === true,
          }),
        );
    };
    window.addEventListener("keydown", handle, true);
    window.addEventListener("message", fromLocalApp);
    return () => {
      window.removeEventListener("keydown", handle, true);
      window.removeEventListener("message", fromLocalApp);
    };
  }, []);
}
