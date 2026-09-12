"use client";
import "@/app/desktop-responsive.css";
import { useEffect, useState } from "react";
import {
  Command,
  TerminalSquare,
  Search,
  X,
  PanelsTopLeft,
  Ellipsis,
} from "lucide-react";
import Bar from "./Bar";
import Tile from "./Tile";
import Split from "./Split";
import Overlays from "./Overlays";
import { useDesktop } from "@/lib/state/store";
import { geometry, ids, type Rect } from "@/lib/layout/tree";
import { seed } from "@/lib/fs/seed";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { useKeybind } from "@/lib/keys/useKeybind";
import { oma } from "@/lib/oma/bus";
import { apps, type AppId } from "@/lib/apps/registry";
import { startActivityTracking } from '@/lib/activity/tracker';
function style(r: Rect) {
  const l = r.x > 0 ? 4 : 0,
    t = r.y > 0 ? 4 : 0,
    right = r.x + r.w < 0.99999 ? 4 : 0,
    bottom = r.y + r.h < 0.99999 ? 4 : 0;
  return {
    left: `calc(${r.x * 100}% + ${l}px)`,
    top: `calc(${r.y * 100}% + ${t}px)`,
    width: `calc(${r.w * 100}% - ${l + right}px)`,
    height: `calc(${r.h * 100}% - ${t + bottom}px)`,
  };
}
export default function Desktop() {
  const s = useDesktop(),
    [bootError, setBootError] = useState("");
  useKeybind();
  useEffect(() => startActivityTracking(useDesktop), []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const compact = matchMedia(
          "(max-width: 900px), (pointer: coarse)",
        ).matches;
        // The software keyboard shrinks visualViewport on Safari without changing dvh.
        document.documentElement.style.setProperty(
          "--desktop-viewport-height",
          compact ? `${viewport.height}px` : "100dvh",
        );
      });
    };
    resize();
    viewport.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty(
        "--desktop-viewport-height",
      );
    };
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await useDesktop.persist.rehydrate();
        await seed();
        const seen = await fs.exists("/.oma/seen-welcome");
        if (!live) return;
        useDesktop.getState().boot();
        if (!seen) useDesktop.getState().setOverlay("welcome");
        const url = new URL(window.location.href);
        const requestedApp = url.searchParams.get("app");
        if (requestedApp && Object.hasOwn(apps, requestedApp)) {
          useDesktop.getState().launch(requestedApp as AppId);
          url.searchParams.delete("app");
          window.history.replaceState(window.history.state, "", url);
          if (!seen) useDesktop.getState().setOverlay("welcome");
        }
      } catch (e) {
        if (live) {
          setBootError(errorMessage(e));
          useDesktop.getState().boot();
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!s.notice) return;
    const timer = setTimeout(() => useDesktop.getState().notify(null), 4500);
    return () => clearTimeout(timer);
  }, [s.notice]);
  const positions = new Map<string, Rect & { workspace: number }>();
  Object.entries(s.workspaces).forEach(([n, w]) =>
    geometry(w.layout).forEach((r) =>
      positions.set(r.id, { ...r, workspace: Number(n) }),
    ),
  );
  const ws = s.workspaces[s.workspace];
  const windows = ids(ws.layout);
  useEffect(() => {
    document
      .querySelector('.touch-window-list [aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [s.workspace, ws.focus]);
  return (
    <div className="os-shell">
      <Bar />
      <main className="desktop" aria-label="Desktop">
        <div className="workspace-area" data-workspace={s.workspace}>
          {s.ready ? (
            Object.entries(s.tiles).map(([id, tile]) => {
              const r = positions.get(id);
              if (!r) return null;
              const visible =
                r.workspace === s.workspace &&
                (!s.fullscreen || s.fullscreen === id);
              return (
                <Tile
                  key={id}
                  id={id}
                  tile={tile}
                  visible={visible}
                  mobileActive={visible && ws.focus === id}
                  active={visible && ws.focus === id && !s.overlay}
                  style={
                    s.fullscreen === id
                      ? { inset: 0, width: "100%", height: "100%" }
                      : style(r)
                  }
                />
              );
            })
          ) : (
            <div className="boot-state">
              <Command size={20} />
              <span>Opening your workspace…</span>
            </div>
          )}
          {s.ready && !ws.layout && (
            <div className="empty-workspace" key={s.workspace}>
              <div className="empty-number">
                {String(s.workspace).padStart(2, "0")}
              </div>
              <p>Room to think.</p>
              <div>
                <button
                  onClick={() =>
                    void oma(["launch", "term"], { store: useDesktop, fs })
                  }
                >
                  <TerminalSquare size={14} />
                  Terminal <kbd>Alt+Enter</kbd>
                </button>
                <button onClick={() => s.setOverlay("launcher")}>
                  <Search size={14} />
                  Launcher <kbd>⌘K / Ctrl+Space</kbd>
                </button>
              </div>
            </div>
          )}
          {s.ready && ws.layout && !s.fullscreen && <Split node={ws.layout} />}
        </div>
      </main>
      <nav className="touch-dock" aria-label="Desktop window switcher">
        <button
          aria-label="Show all apps"
          title="Launcher"
          onClick={() => s.setOverlay("launcher")}
        >
          <Command size={18} />
        </button>
        <div
          className="touch-window-list"
          aria-label={`Workspace ${s.workspace} windows`}
        >
          {windows.map((id) => {
            const tile = s.tiles[id];
            if (!tile) return null;
            return (
              <button
                key={id}
                aria-current={ws.focus === id ? "true" : undefined}
                className={ws.focus === id ? "selected" : ""}
                title={tile.path ?? tile.title}
                onClick={() => {
                  if (s.fullscreen && s.fullscreen !== id) s.toggleFullscreen();
                  s.focus(id);
                }}
              >
                <span>{tile.path?.split("/").pop() || tile.title}</span>
                {s.dirty[id] && <span aria-label="Unsaved changes">*</span>}
              </button>
            );
          })}
          {!windows.length && (
            <span className="dock-empty">Workspace {s.workspace}</span>
          )}
        </div>
        <button
          aria-label="All windows and workspaces"
          title="All windows"
          onClick={() => s.setOverlay("window")}
        >
          <PanelsTopLeft size={18} />
        </button>
        <button
          aria-label="System menu"
          title="System menu"
          onClick={() => s.setOverlay("menu")}
        >
          <Ellipsis size={18} />
        </button>
      </nav>
      {bootError && <div className="boot-error">{bootError}</div>}
      <Overlays />
      {s.notice && (
        <div className="notification" role="status">
          <span>{s.notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => s.notify(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
