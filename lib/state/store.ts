import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apps, type AppId } from "@/lib/apps/registry";
import { restoreDesktop } from './restore';
import {
  close,
  split,
  swap,
  neighbor,
  ids,
  setRatio,
  grow,
  type LayoutNode,
  type Direction,
} from "@/lib/layout/tree";
export type Tile = {
  app: AppId;
  title: string;
  createdAt: number;
  path?: string;
};
type Workspace = { layout: LayoutNode | null; focus: string | null };
export type Overlay =
  | null
  | "launcher"
  | "menu"
  | "keys"
  | "welcome"
  | "theme"
  | "reset"
  | "about"
  | "window"
  | "shortcuts"
  | "close-confirm";
const initial = () => {
  const workspaces: Record<number, Workspace> = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [i + 1, { layout: null, focus: null }]),
  );
  workspaces[1] = {
    layout: {
      type: "split",
      dir: "row",
      ratio: 0.4,
      a: { type: "leaf", id: "term-1" },
      b: {
        type: "split",
        dir: "col",
        ratio: 0.62,
        a: { type: "leaf", id: "editor-1" },
        b: { type: "leaf", id: "files-1" },
      },
    },
    focus: "term-1",
  };
  const tiles: Record<string, Tile> = {
    "term-1": { app: "term", title: "Terminal", createdAt: 0 },
    "editor-1": {
      app: "editor",
      title: "Editor",
      createdAt: 0,
      path: "/.oma/SKILL.md",
    },
    "files-1": { app: "files", title: "Files", createdAt: 0 },
  };
  return {
    workspaces,
    tiles,
    workspace: 1,
    theme: "tokyo-night" as const,
    modifier: "alt" as "alt" | "control-shift",
  };
};
type Store = ReturnType<typeof initial> & {
  ready: boolean;
  overlay: Overlay;
  fullscreen: string | null;
  notice: string | null;
  fsVersion: number;
  agentStatus: "offline" | "idle" | "think" | "err";
  dirty: Record<string, boolean>;
  closeRequest: string | null;
  boot: () => void;
  launch: (app: AppId, path?: string) => string;
  closeTile: (id?: string, force?: boolean) => void;
  gotoWs: (n: number) => void;
  moveToWs: (n: number) => void;
  focus: (id: string) => void;
  focusDir: (dir: Direction, exchange?: boolean) => void;
  resize: (path: string, ratio: number) => void;
  grow: (delta: number) => void;
  setOverlay: (overlay: Overlay) => void;
  toggleFullscreen: () => void;
  notify: (message: string | null) => void;
  refreshFs: () => void;
  setDirty: (id: string, dirty: boolean) => void;
  reset: () => void;
};
export const useDesktop = create<Store>()(
  persist(
    (set, get) => ({
      ...initial(),
      ready: false,
      overlay: null,
      fullscreen: null,
      notice: null,
      fsVersion: 0,
      agentStatus: "offline",
      dirty: {},
      closeRequest: null,
      boot: () => set({ ready: true }),
      launch: (app, path) => {
        const state = get();
        path ??= apps[app].defaultPath;
        if (app === "notice") {
          set({ overlay: "about" });
          return "";
        }
        const existing = Object.entries(state.tiles).find(
          ([, t]) =>
            t.app === app &&
            (apps[app].singleton ||
              (app === "editor" && (!path || t.path === path)) ||
              (['notes','canvas','lab','data','tasks','media','draw'].includes(app) && (t.path ?? apps[app].defaultPath) === path)),
        );
        if (existing) {
          const [id] = existing;
          const ws = Number(
            Object.keys(state.workspaces).find((n) =>
              ids(state.workspaces[Number(n)].layout).includes(id),
            ),
          );
          set({
            workspace: ws,
            fullscreen: null,
            overlay: null,
            ...(['files','database'].includes(app) && path && !state.dirty[id] ? { tiles: { ...state.tiles, [id]: { ...state.tiles[id], path } } } : {}),
            workspaces: {
              ...state.workspaces,
              [ws]: { ...state.workspaces[ws], focus: id },
            },
          });
          return id;
        }
        const ws = apps[app].defaultWorkspace ?? state.workspace,
          id = `${app}-${crypto.randomUUID()}`,
          w = state.workspaces[ws];
        set({
          workspace: ws,
          fullscreen: null,
          overlay: null,
          tiles: {
            ...state.tiles,
            [id]: {
              app,
              title: apps[app].title,
              createdAt: Date.now(),
              path: app === "editor" ? (path ?? "/.oma/config.toml") : path,
            },
          },
          workspaces: {
            ...state.workspaces,
            [ws]: {
              layout: split(w.layout, w.focus ?? ids(w.layout)[0] ?? null, id),
              focus: id,
            },
          },
        });
        return id;
      },
      closeTile: (requested, force = false) => {
        const s = get(),
          id = requested ?? s.workspaces[s.workspace].focus;
        if (!id) return;
        if(s.tiles[id]?.app==='agent'&&s.agentStatus==='think'){s.notify('Stop the agent before closing its window.');return;}
      if (s.dirty[id] && !force) {
          set({ closeRequest: id, overlay: 'close-confirm' });
          return;
        }
        const tiles = { ...s.tiles };
        delete tiles[id];
        const dirty = { ...s.dirty }; delete dirty[id];
        const workspaces = { ...s.workspaces };
        for (const key of Object.keys(workspaces)) {
          const n = Number(key),
            w = workspaces[n];
          if (ids(w.layout).includes(id)) {
            const layout = close(w.layout, id);
            workspaces[n] = {
              layout,
              focus: w.focus === id ? (ids(layout)[0] ?? null) : w.focus,
            };
          }
        }
        set({ tiles, workspaces, dirty, fullscreen: null, closeRequest: null, ...(s.overlay === 'close-confirm' ? { overlay: null } : {}) });
      },
      gotoWs: (n) => {
        if (Number.isInteger(n) && n >= 1 && n <= 9)
          set({ workspace: n, fullscreen: null, overlay: null });
      },
      moveToWs: (n) => {
        const s = get(),
          id = s.workspaces[s.workspace].focus;
        if (!id || n === s.workspace || !Number.isInteger(n) || n < 1 || n > 9)
          return;
        const from = close(s.workspaces[s.workspace].layout, id),
          to = s.workspaces[n];
        set({
          fullscreen: null,
          workspaces: {
            ...s.workspaces,
            [s.workspace]: { layout: from, focus: ids(from)[0] ?? null },
            [n]: {
              layout: split(
                to.layout,
                to.focus ?? ids(to.layout)[0] ?? null,
                id,
              ),
              focus: id,
            },
          },
        });
        s.notify(`Moved to workspace ${n}`);
      },
      focus: (id) => {
        const s = get(),
          w = s.workspaces[s.workspace];
        if (w.focus !== id)
          set({
            workspaces: { ...s.workspaces, [s.workspace]: { ...w, focus: id } },
          });
      },
      focusDir: (dir, exchange = false) => {
        const s = get(),
          w = s.workspaces[s.workspace];
        if (!w.focus || !w.layout) return;
        const target = neighbor(w.layout, w.focus, dir);
        if (target)
          set({
            workspaces: {
              ...s.workspaces,
              [s.workspace]: {
                layout: exchange ? swap(w.layout, w.focus, target) : w.layout,
                focus: exchange ? w.focus : target,
              },
            },
          });
      },
      resize: (path, ratio) => {
        const s = get(),
          w = s.workspaces[s.workspace];
        if (w.layout)
          set({
            workspaces: {
              ...s.workspaces,
              [s.workspace]: { ...w, layout: setRatio(w.layout, path, ratio) },
            },
          });
      },
      grow: (delta) => {
        const s = get(),
          w = s.workspaces[s.workspace];
        if (w.layout && w.focus)
          set({
            workspaces: {
              ...s.workspaces,
              [s.workspace]: { ...w, layout: grow(w.layout, w.focus, delta) },
            },
          });
      },
      setOverlay: (overlay) => set({ overlay }),
      toggleFullscreen: () =>
        set((s) => ({
          fullscreen: s.fullscreen ? null : s.workspaces[s.workspace].focus,
        })),
      notify: (notice) => set({ notice }),
      refreshFs: () => set((s) => ({ fsVersion: s.fsVersion + 1 })),
      setDirty: (id, dirty) =>
        set((s) => ({ dirty: { ...s.dirty, [id]: dirty } })),
      reset: () =>
        set({ ...initial(), fullscreen: null, overlay: null, dirty: {}, closeRequest: null }),
    }),
    {
      name: "oma.os.desktop.v1",
      skipHydration: true,
      merge: (persisted, current) => ({ ...current, ...(restoreDesktop(persisted) ?? {}) }),
      partialize: (s) => ({
        modifier: s.modifier,
        theme: s.theme,
        workspace: s.workspace,
        workspaces: s.workspaces,
        tiles: s.tiles,
      }),
    },
  ),
);
