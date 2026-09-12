"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  Search,
  TerminalSquare,
  Folder,
  FileCode2,
  ChevronRight,
  ArrowUpRight,
  Keyboard,
  Palette,
  Hash,
  Info,
  RotateCcw,
  Check,
  FileText,
  Globe,
  Maximize2,
  Minus,
  Plus,
  X,
  PanelsTopLeft,
  AppWindow,
  NotebookPen,
  Shapes,
  Braces,
  Table2,
  Images,
  ListTodo,
  Settings2,
  Grid2X2,
  type LucideIcon,
} from "lucide-react";
import { useDesktop } from "@/lib/state/store";
import { apps, type AppId } from "@/lib/apps/registry";
import { oma } from "@/lib/oma/bus";
import { fs, type Entry } from "@/lib/fs/opfs";
import { keybinds } from "@/lib/keys/bindings";
import { dismissWelcome } from "@/lib/keys/useKeybind";
import { ids } from "@/lib/layout/tree";
const icons: Record<string, LucideIcon> = {
  term: TerminalSquare,
  editor: FileCode2,
  files: Folder,
  agent: ChevronRight,
  notice: Info,
  browser: Globe,
  notes: NotebookPen,
  canvas: Shapes,
  lab: Braces,
  data: Table2,
  media: Images,
  tasks: ListTodo,
  settings: Settings2,
  apps: Grid2X2,
};
type Row = {
  id: string;
  title: string;
  hint?: string;
  group: string;
  searchText?: string;
  icon: LucideIcon;
  run: () => void;
};
const matches = (query: string, title: string) => {
  let i = 0;
  for (const c of title.toLowerCase()) {
    if (c === query[i]) i++;
  }
  return i === query.length;
};
function CloseConfirmation() {
  const requested = useDesktop(state => state.closeRequest);
  const tile = useDesktop(state => requested ? state.tiles[requested] : undefined);
  return <div className="confirmation"><h2>Close {tile?.title ?? 'this window'}?</h2><p>This window has unsaved changes. Return to the app to save them, or close anyway. A file write already underway may still finish.</p><div><button onClick={() => useDesktop.getState().setOverlay(null)}>Keep open</button><button className="danger" onClick={() => { if (requested) useDesktop.getState().closeTile(requested, true); else useDesktop.getState().setOverlay(null); }}>Close anyway</button></div></div>;
}
export default function Overlays() {
  const overlay = useDesktop((s) => s.overlay),
    modifier = useDesktop((s) => s.modifier),
    panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (overlay) {
      const previous = document.activeElement as HTMLElement | null;
      const target =
        panel.current?.querySelector<HTMLElement>("input") ??
        panel.current?.querySelector<HTMLElement>("button:not(.overlay-close)");
      (target ?? panel.current)?.focus();
      return () => {
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      };
    }
  }, [overlay]);
  if (!overlay) return null;
  const close = () => useDesktop.getState().setOverlay(null);
  return (
    <div
      className="scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          if (overlay === "welcome") void dismissWelcome();
          else close();
        }
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={
          overlay === "keys"
            ? "Keyboard shortcuts"
            : overlay === "welcome"
              ? "Welcome to oma.os"
              : overlay === "launcher"
                ? "Launcher"
                : overlay === "menu"
                  ? "System menu"
                  : overlay === "shortcuts"
                    ? "Keyboard and focus"
                    : overlay === "window"
                      ? "Window controls"
                      : overlay === "reset"
                        ? "Reset machine"
                        : overlay === 'close-confirm'
                          ? 'Close unsaved window'
                        : overlay === "theme"
                          ? "Theme"
                          : "About oma.os"
        }
        className={"overlay " + (overlay === "keys" ? "keys-panel" : "")}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const focusable = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input,[tabindex="0"]',
              ),
            );
            const index = focusable.indexOf(
              document.activeElement as HTMLElement,
            );
            if (focusable.length) {
              e.preventDefault();
              focusable[
                (index + (e.shiftKey ? -1 : 1) + focusable.length) %
                  focusable.length
              ].focus();
            }
          }
        }}
      >
        <button
          className="overlay-close"
          aria-label="Close dialog"
          onClick={() => {
            if (overlay === "welcome") void dismissWelcome();
            else close();
          }}
        >
          <X size={16} />
        </button>
        {overlay === 'close-confirm' ? (
          <CloseConfirmation />
        ) : overlay === "shortcuts" ? (
          <ShortcutSettings />
        ) : overlay === "window" ? (
          <WindowControls />
        ) : overlay === "launcher" || overlay === "menu" ? (
          <Picker key={overlay} menu={overlay === "menu"} />
        ) : overlay === "keys" ? (
          <>
            <div className="overlay-heading">
              <Keyboard size={16} />
              <span>Keyboard shortcuts</span>
              <kbd>esc</kbd>
            </div>
            <div className="keys-intro">
              ⌘K opens the launcher on Mac. Ctrl+Space is also available.
            </div>
            <div className="keys-grid">
              {[
                ["⌘K", "Launcher on Mac"],
                ["Ctrl+.", "System menu"],
                ...keybinds,
              ].map(([key, label]) => (
                <div className="key-row" key={key}>
                  <span>{label}</span>
                  <kbd>
                    {modifier === "control-shift"
                      ? key.startsWith("Alt+Shift")
                        ? key.replace("Alt+Shift", "Ctrl+Shift+Alt")
                        : key.replaceAll("Alt+", "Ctrl+Shift+")
                      : key}
                  </kbd>
                </div>
              ))}
            </div>
            <div className="overlay-footer settings-link">
              <span>System shortcuts take precedence over a web page.</span>
              <button
                onClick={() => useDesktop.getState().setOverlay("shortcuts")}
              >
                Configure keyboard & focus →
              </button>
            </div>
          </>
        ) : overlay === "welcome" ? (
          <div className="welcome">
            <div className="welcome-brand">
              <Command size={25} />
              <span>oma.os</span>
              <small>0.1.0</small>
            </div>
            <p className="welcome-lead">
              A browser desktop with Omarchy’s habits.
            </p>
            <div className="welcome-facts">
              <p>
                <kbd>⌘K</kbd> opens the launcher on Mac. <kbd>Ctrl+Space</kbd>{" "}
                works too.
              </p>
              <p>
                <kbd>Alt+←↓↑→</kbd> moves focus. <kbd>Alt+1…9</kbd> switches
                workspaces.
              </p>
              <p>
                Your files stay in this browser. Web pages connect when you open
                them.
              </p>
              <p>This is not Omarchy Linux. It is the desk, in a tab.</p>
            </div>
            <button
              autoFocus
              className="welcome-enter"
              onClick={() => void dismissWelcome()}
            >
              <span>Enter the desktop</span>
              <kbd>↵</kbd>
            </button>
            <div className="welcome-bottom">
              <span>Local files. Your workspace.</span>
              <span>Alt+K for all keys</span>
            </div>
          </div>
        ) : overlay === "theme" ? (
          <>
            <div className="overlay-heading">
              <Palette size={16} />
              <span>Theme</span>
              <kbd>esc</kbd>
            </div>
            <button
              className="theme-choice"
              onClick={() => {
                void oma(["theme", "set", "tokyo-night"], {
                  store: useDesktop,
                  fs,
                });
                close();
              }}
            >
              <div>
                <strong>Tokyo Night</strong>
                <span>Quiet colors. Sharp edges.</span>
              </div>
              <div className="swatches">
                {[
                  "#7aa2f7",
                  "#7dcfff",
                  "#9ece6a",
                  "#e0af68",
                  "#f7768e",
                  "#bb9af7",
                ].map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </div>
              <Check size={16} />
            </button>
            <div className="overlay-footer">
              The default, and the only theme in v1.
            </div>
          </>
        ) : overlay === "reset" ? (
          <>
            <div className="overlay-heading">
              <RotateCcw size={16} />
              <span>Reset this machine?</span>
              <kbd>esc</kbd>
            </div>
            <div className="confirmation">
              <p>
                This permanently deletes all oma.os files in this browser and
                restores the default workspace.
              </p>
              <div>
                <button onClick={close}>Keep my machine</button>
                <button
                  className="danger"
                  onClick={async () => {
                    const result = await oma(["reset", "--yes"], {
                      store: useDesktop,
                      fs,
                    });
                    if (!result.ok)
                      useDesktop.getState().notify(result.message);
                  }}
                >
                  Delete files and reset
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="overlay-heading">
              <Command size={16} />
              <span>oma.os</span>
              <kbd>esc</kbd>
            </div>
            <div className="about-copy">
              <h2>A browser desktop with Omarchy’s habits.</h2>
              <p>
                Alt is Super.
                <br />
                This is not Linux. It is the desk.
              </p>
              <p className="muted">
                Version 0.1.0 · MIT
                <br />
                Not affiliated with Omarchy, Omacom, 37signals, or DHH.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function Picker({ menu }: { menu: boolean }) {
  const desktop = useDesktop();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [selected, setSelected] = useState(0),
    [files, setFiles] = useState<Entry[]>([]),
    input = useRef<HTMLInputElement>(null),
    rowsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    input.current?.focus();
    if (!menu)
      void fs
        .search()
        .then(setFiles)
        .catch(() => {});
  }, [menu]);
  const bus = (argv: string[]) => {
    useDesktop.getState().setOverlay(null);
    void oma(argv, { store: useDesktop, fs }).then((r) => {
      if (r.message) useDesktop.getState().notify(r.message);
    });
  };
  const all = useMemo<Row[]>(
    () => [
      ...Object.values(apps)
        .filter((a) => a.id !== "notice")
        .map((a) => ({
          id: a.id,
          title: a.title,
          hint: a.hint,
          group: "Apps",
          searchText:
            a.description +
            " " +
            ((a as typeof a & { category?: string; keywords?: string[] })
              .category ?? "") +
            " " +
            ((a as typeof a & { keywords?: string[] }).keywords?.join(" ") ??
              ""),
          icon: icons[a.id] ?? AppWindow,
          run: () => bus(["launch", a.id]),
        })),
      ...(!menu
        ? Object.entries(desktop.workspaces).flatMap(([workspace, value]) =>
            ids(value.layout).map((id) => {
              const tile = desktop.tiles[id];
              return {
                id: `window-${id}`,
                title: tile?.path?.split("/").pop() || tile?.title || "Window",
                hint: `Workspace ${workspace}`,
                group: "Windows",
                searchText: tile?.path,
                icon: PanelsTopLeft,
                run: () => {
                  desktop.gotoWs(Number(workspace));
                  desktop.focus(id);
                },
              };
            }),
          )
        : []),
      ...Array.from({ length: 9 }, (_, i) => ({
        id: "ws" + i,
        title: `Workspace ${i + 1}`,
        hint: `Alt+${i + 1}`,
        group: "Workspace",
        icon: Hash,
        run: () => bus(["ws", String(i + 1)]),
      })),
      {
        id: "shortcuts",
        title: "Keyboard & focus",
        group: "System",
        icon: Keyboard,
        run: () => useDesktop.getState().setOverlay("shortcuts"),
      },
      {
        id: "window",
        title: "Window controls",
        group: "Window",
        icon: Maximize2,
        run: () => useDesktop.getState().setOverlay("window"),
      },
      {
        id: "theme",
        title: "Tokyo Night",
        group: "Theme",
        icon: Palette,
        run: () => useDesktop.getState().setOverlay("theme"),
      },
      {
        id: "keys",
        title: "Keyboard shortcuts",
        hint: "Alt+K",
        group: "System",
        icon: Keyboard,
        run: () => useDesktop.getState().setOverlay("keys"),
      },
      {
        id: "reset",
        title: "Reset machine",
        group: "System",
        icon: RotateCcw,
        run: () => useDesktop.getState().setOverlay("reset"),
      },
      {
        id: "about",
        title: "About oma.os",
        group: "System",
        icon: Info,
        run: () => useDesktop.getState().setOverlay("about"),
      },
      ...(!menu
        ? [
            {
              id: "help",
              title: "oma help",
              group: "Commands",
              icon: TerminalSquare,
              run: () => {
                bus(["launch", "term"]);
                useDesktop
                  .getState()
                  .notify("Type oma help in the terminal for all commands.");
              },
            },
            {
              id: "version",
              title: "oma version",
              group: "Commands",
              icon: TerminalSquare,
              run: () => bus(["version"]),
            },
            {
              id: "agent-status",
              title: "oma agent status",
              group: "Commands",
              icon: TerminalSquare,
              run: () => bus(["agent", "status"]),
            },
            ...files.map((f) => ({
              id: f.path,
              title: f.name,
              hint: f.path,
              group: "Files",
              icon: FileText,
              run: () => {
                useDesktop.getState().setOverlay(null);
                useDesktop.getState().launch("editor", f.path);
              },
            })),
          ]
        : []),
    ],
    [files, menu, desktop.workspaces, desktop.tiles],
  );
  const needle = query.toLowerCase().replace(/\s+/g, "");
  const rank = (row: Row) => {
    if (!needle) return 0;
    const title = row.title.toLowerCase().replace(/\s+/g, "");
    return title === needle
      ? 0
      : title.startsWith(needle)
        ? 1
        : title.includes(needle)
          ? 2
          : matches(needle, title)
            ? 3
            : 4;
  };
  const filtered = all
      .filter(
        (row) =>
          (category === "All" || row.group === category) &&
          matches(
            query.toLowerCase().replace(/\s+/g, ""),
            (
              row.title +
              " " +
              (row.hint ?? "") +
              " " +
              (row.searchText ?? "")
            ).replace(/\s+/g, ""),
          ),
      )
      .sort((a, b) => rank(a) - rank(b)),
    index = Math.min(selected, Math.max(0, filtered.length - 1));
  useEffect(() => {
    rowsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query, category]);
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "j")) {
          e.preventDefault();
          setSelected((index + 1) % Math.max(1, filtered.length));
        }
        if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "k")) {
          e.preventDefault();
          setSelected(
            (index - 1 + filtered.length) % Math.max(1, filtered.length),
          );
        }
        if (e.key === "Enter" && e.target === input.current) {
          e.preventDefault();
          filtered[index]?.run();
        }
      }}
    >
      <div className="picker-search">
        {menu ? <Command size={17} /> : <Search size={17} />}
        <input
          ref={input}
          role="combobox"
          aria-label={
            menu ? "Search system menu" : "Search apps, commands, files"
          }
          aria-expanded="true"
          aria-controls="picker-results"
          aria-activedescendant={
            filtered[index] ? "result-" + filtered[index].id : undefined
          }
          placeholder={menu ? "System menu" : "Apps, commands, files…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />
        <kbd>esc</kbd>
      </div>
      {!menu && (
        <div className="launcher-filters" aria-label="Search categories">
          {["All", "Apps", "Windows", "Files", "Commands", "Workspace"].map(
            (name) => (
              <button
                key={name}
                aria-pressed={category === name}
                onClick={() => {
                  setCategory(name);
                  setSelected(0);
                  input.current?.focus();
                }}
              >
                {name === "Workspace" ? "Workspaces" : name}
              </button>
            ),
          )}
        </div>
      )}
      <div
        className="picker-results"
        ref={rowsRef}
        id="picker-results"
        role="listbox"
      >
        {filtered.length === 0 ? (
          <div className="no-results">No matches for “{query}”</div>
        ) : (
          filtered.map((row, i) => (
            <div key={row.id}>
              {(i === 0 || filtered[i - 1].group !== row.group) && (
                <div className="picker-group">{row.group}</div>
              )}
              <button
                id={"result-" + row.id}
                role="option"
                aria-selected={i === index}
                className={"picker-row " + (i === index ? "selected" : "")}
                onPointerMove={() => setSelected(i)}
                onClick={row.run}
              >
                <row.icon size={16} />
                <span>{row.title}</span>
                <kbd>{row.hint}</kbd>
                {i === index && <ChevronRight size={13} />}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="picker-footer">
        <span>
          <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open
        </span>
        <span>{menu ? "oma.os" : "⌘K / Ctrl+Space"}</span>
      </div>
    </div>
  );
}

function WindowControls() {
  const s = useDesktop(),
    focused = s.workspaces[s.workspace].focus,
    tile = focused ? s.tiles[focused] : null;
  const run = (args: string[]) => {
    s.setOverlay(null);
    void oma(args, { store: useDesktop, fs }).then((r) => {
      if (!r.ok) s.notify(r.message);
    });
  };
  return (
    <>
      <div className="overlay-heading">
        <Maximize2 size={16} />
        <span>{tile?.title ?? "No focused window"}</span>
        <kbd>esc</kbd>
      </div>
      <div className="window-actions">
        <button disabled={!tile} onClick={() => run(["close"])}>
          <X size={15} />
          <span>Close window</span>
          <kbd>Alt+Q</kbd>
        </button>
        <button disabled={!tile} onClick={() => run(["window", "fullscreen"])}>
          <Maximize2 size={15} />
          <span>{s.fullscreen ? "Restore tiling" : "Fullscreen"}</span>
          <kbd>Alt+F</kbd>
        </button>
        <button disabled={!tile} onClick={() => run(["window", "grow"])}>
          <Plus size={15} />
          <span>Grow window</span>
          <kbd>Alt+=</kbd>
        </button>
        <button disabled={!tile} onClick={() => run(["window", "shrink"])}>
          <Minus size={15} />
          <span>Shrink window</span>
          <kbd>Alt+−</kbd>
        </button>
        <div className="picker-group">Move to workspace</div>
        <div className="move-workspaces">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              disabled={!tile || n === s.workspace}
              onClick={() => run(["window", "move", String(n)])}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="window-overview">
        <div className="picker-group">
          All workspaces · {Object.keys(s.tiles).length} open windows
        </div>
        <div className="overview-workspaces" aria-label="Switch workspace">
          {Object.entries(s.workspaces).map(([number, workspace]) => (
            <button
              key={number}
              aria-current={s.workspace === Number(number) ? "page" : undefined}
              onClick={() => s.gotoWs(Number(number))}
            >
              <span>{number}</span>
              <small>{ids(workspace.layout).length || "—"}</small>
            </button>
          ))}
        </div>
        <div className="overview-windows">
          {Object.entries(s.workspaces).flatMap(([number, workspace]) =>
            ids(workspace.layout).map((id) => {
              const item = s.tiles[id];
              if (!item) return null;
              const Icon = icons[item.app] ?? AppWindow;
              return (
                <button
                  key={id}
                  className={id === focused ? "current" : ""}
                  onClick={() => {
                    s.gotoWs(Number(number));
                    s.focus(id);
                  }}
                >
                  <Icon size={16} />
                  <span>
                    <strong>
                      {item.path?.split("/").pop() || item.title}
                      {s.dirty[id] && " *"}
                    </strong>
                    <small>{item.path || item.title}</small>
                  </span>
                  <kbd>{number}</kbd>
                  {id === focused && <Check size={13} />}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <div className="overlay-footer">
        Drag any divider to resize. Alt+Q closes a window; Cmd+Q belongs to the
        browser.
      </div>
    </>
  );
}

function ShortcutSettings() {
  const s = useDesktop();
  const focusMode = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (!document.documentElement.requestFullscreen) {
        s.notify(
          "Fullscreen is unavailable here. Use your browser’s fullscreen control.",
        );
        return;
      }
      await document.documentElement.requestFullscreen();
      const keyboard = (
        navigator as Navigator & { keyboard?: { lock: () => Promise<void> } }
      ).keyboard;
      if (keyboard) {
        try {
          await keyboard.lock();
        } catch {
          /* OS shortcuts still take precedence. */
        }
      }
      s.setOverlay(null);
    } catch {
      s.notify("Use your browser’s fullscreen control to enter focus mode.");
    }
  };
  return (
    <>
      <div className="overlay-heading">
        <Keyboard size={16} />
        <span>Keyboard & focus</span>
        <kbd>esc</kbd>
      </div>
      <div className="shortcut-settings">
        <p className="settings-intro">
          On Mac, Option is Alt. If another app uses Option+Space, use{" "}
          <kbd>⌘K</kbd> for the launcher or choose a different modifier below.
        </p>
        <div className="settings-label">DESKTOP MODIFIER</div>
        <div className="modifier-options">
          {[
            {
              id: "alt" as const,
              title: "Option / Alt",
              detail: "The Omarchy-style defaults",
            },
            {
              id: "control-shift" as const,
              title: "Control + Shift",
              detail: "Alternative for system conflicts",
            },
          ].map((option) => (
            <button
              key={option.id}
              className={s.modifier === option.id ? "chosen" : ""}
              onClick={() => useDesktop.setState({ modifier: option.id })}
            >
              <span>{option.title}</span>
              <small>{option.detail}</small>
              {s.modifier === option.id && <Check size={13} />}
            </button>
          ))}
        </div>
        <div className="settings-example">
          {s.modifier === "alt"
            ? "Option+Q closes · Option+Enter opens a terminal"
            : "Ctrl+Shift+Q closes · Ctrl+Shift+Enter opens a terminal"}
        </div>
        <div className="settings-label">FOCUS MODE</div>
        <p className="settings-intro">
          Fullscreen gives the desktop more room. Supporting browsers can also
          capture more keyboard shortcuts. macOS shortcuts still belong to
          macOS.
        </p>
        <button className="focus-mode-button" onClick={() => void focusMode()}>
          <Maximize2 size={14} />
          Toggle fullscreen focus mode
        </button>
      </div>
      <div className="overlay-footer">
        ⌘K: launcher · Ctrl+.: system menu · Esc: dismiss
      </div>
    </>
  );
}
