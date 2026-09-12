"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Code2,
  Play,
  ShieldCheck,
  Home,
  Plus,
  X,
  Star,
  History,
  Download,
  Search,
  BookOpen,
  Copy,
} from "lucide-react";
import { browserTarget, embedURL } from "@/lib/apps/browser-target";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { loadLocalApp } from "@/lib/browser/local-app";
import { useDesktop } from "@/lib/state/store";
import {
  BrowserLibrary,
  readTabs,
  LIBRARY_KEY,
  pageLabel,
  readLibrary,
  snapshotName,
  visitPage,
} from "@/lib/browser/library";
import "./browser.css";
import RemoteBrowser, { RemoteBrowserHandle } from "./RemoteBrowser";
type Tab = { id: string; initial: string; title: string };
export default function Browser({
  id,
  path,
  active,
}: {
  id: string;
  path?: string;
  active: boolean;
}) {
  const [restored] = useState(() => {
    try {
      return readTabs(
        localStorage.getItem("oma-browser-tabs:" + id),
        path || "oma:start",
      );
    } catch {
      return readTabs(null, path || "oma:start");
    }
  });
  const [tabs, setTabs] = useState<Tab[]>(restored.tabs);
  const [selected, setSelected] = useState(restored.selected);
  const [opened, setOpened] = useState(() => new Set([restored.selected]));
  useEffect(() => {
    setOpened((old) => (old.has(selected) ? old : new Set([...old, selected])));
  }, [selected]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "oma-browser-tabs:" + id,
        JSON.stringify({ tabs, selected }),
      );
    } catch {}
  }, [id, tabs, selected]);
  const [runtime, setRuntime] = useState(false);
  useEffect(() => {
    void fetch("/api/browser-runtime?capabilities=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRuntime(data?.available === true))
      .catch(() => {});
  }, []);
  const [library, setLibrary] = useState<BrowserLibrary>({
    bookmarks: [],
    history: [],
  });
  useEffect(() => {
    setLibrary(readLibrary(localStorage.getItem(LIBRARY_KEY)));
    const sync = () =>
      setLibrary(readLibrary(localStorage.getItem(LIBRARY_KEY)));
    window.addEventListener("oma:browser-library", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("oma:browser-library", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const updateLibrary = useCallback(
    (update: (old: BrowserLibrary) => BrowserLibrary) => {
      const next = update(readLibrary(localStorage.getItem(LIBRARY_KEY)));
      setLibrary(next);
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event("oma:browser-library"));
      } catch {
        useDesktop
          .getState()
          .notify("Browser library could not be saved. Storage may be full.");
      }
    },
    [],
  );
  const addTab = (url = "oma:start") => {
    if (tabs.length >= 12) {
      useDesktop
        .getState()
        .notify(
          "Close a browser tab before opening more. This window keeps up to 12 running tabs.",
        );
      return;
    }
    try {
      url = browserTarget(url);
    } catch {
      return;
    }
    const key = crypto.randomUUID();
    setTabs((old) => [
      ...old,
      { id: key, initial: url, title: pageLabel(url) },
    ]);
    setSelected(key);
  };
  const closeTab = (key: string) => {
    if (tabs.length === 1) {
      useDesktop.getState().closeTile(id);
      return;
    }
    const position = tabs.findIndex((t) => t.id === key);
    setTabs((old) => old.filter((t) => t.id !== key));
    if (selected === key)
      setSelected(tabs[position - 1]?.id || tabs[position + 1].id);
  };
  return (
    <div
      className="oma-browser"
      data-runtime={runtime ? "chromium" : "document"}
    >
      <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
        {tabs.map((tab) => (
          <div
            className={"browser-tab " + (selected === tab.id ? "selected" : "")}
            key={tab.id}
          >
            <button
              role="tab"
              aria-selected={selected === tab.id}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                const position = tabs.findIndex((item) => item.id === tab.id);
                const target =
                  event.key === "ArrowRight"
                    ? (position + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (position + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (target === null) return;
                event.preventDefault();
                setSelected(tabs[target].id);
                const buttons = event.currentTarget
                  .closest('[role="tablist"]')
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                buttons?.[target]?.focus();
              }}
              onClick={() => setSelected(tab.id)}
            >
              <Globe size={12} />
              <span>{tab.title}</span>
            </button>
            <button
              aria-label={"Close tab " + tab.title}
              onClick={() => closeTab(tab.id)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="browser-new-tab"
          aria-label="New browser tab"
          title="New tab"
          onClick={() => addTab()}
        >
          <Plus size={15} />
        </button>
      </div>
      {tabs.map((tab) => (
        <div
          className="browser-tab-panel"
          role="tabpanel"
          key={tab.id}
          hidden={selected !== tab.id}
        >
          {opened.has(tab.id) && (
            <BrowserPane
              id={id}
              runtime={runtime}
              path={tab.initial}
              active={active && selected === tab.id}
              library={library}
              updateLibrary={updateLibrary}
              openTab={addTab}
              onAddress={(next) =>
                setTabs((old) =>
                  old.some((t) => t.id === tab.id && t.initial !== next)
                    ? old.map((t) =>
                        t.id === tab.id ? { ...t, initial: next } : t,
                      )
                    : old,
                )
              }
              onTitle={(title) =>
                setTabs((old) =>
                  !old.some((t) => t.id === tab.id && t.title !== title)
                    ? old
                    : old.map((t) =>
                        t.id === tab.id && t.title !== title
                          ? { ...t, title }
                          : t,
                      ),
                )
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
function BrowserPane({
  runtime,
  id,
  path,
  active,
  library,
  updateLibrary,
  openTab,
  onTitle,
  onAddress,
}: {
  id: string;
  path: string;
  active: boolean;
  library: BrowserLibrary;
  updateLibrary: (fn: (old: BrowserLibrary) => BrowserLibrary) => void;
  openTab: (url: string) => void;
  onTitle: (title: string) => void;
  onAddress: (url: string) => void;
  runtime: boolean;
}) {
  const [history, setHistory] = useState(() => {
      try {
        return [browserTarget(path)];
      } catch {
        return ["oma:start"];
      }
    }),
    [index, setIndex] = useState(0),
    [input, setInput] = useState(path),
    [html, setHtml] = useState<string>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0),
    [localApps, setLocalApps] = useState<{ name: string; path: string }[]>([]),
    [panel, setPanel] = useState<"bookmarks" | "history" | null>(null),
    [filter, setFilter] = useState(""),
    [notice, setNotice] = useState("");
  const [chosenMode, setWebMode] = useState<
    "document" | "live" | "remote" | null
  >(null);
  const webMode = chosenMode || (runtime ? "remote" : "document");
  const remote = useRef<RemoteBrowserHandle>(null);
  const [remoteLocation, setRemoteLocation] = useState("");
  const address = useRef<HTMLInputElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    abort = useRef<AbortController | null>(null);
  const url = history[index],
    local = url.startsWith("/"),
    start = url === "oma:start",
    version = useDesktop((s) => s.fsVersion);
  const currentURL =
    webMode === "remote" && !local && !start ? remoteLocation || url : url;
  const isRemote = !local && !start && webMode === "remote";
  const bookmarked = library.bookmarks.some(
    (entry) => entry.url === currentURL,
  );
  const displayedAddress = useRef(url);
  useEffect(() => {
    if (displayedAddress.current === url) return;
    displayedAddress.current = url;
    setInput(url);
  }, [url]);
  useEffect(() => {
    if (remoteLocation && /^https?:/.test(remoteLocation))
      updateLibrary((old) => ({
        ...old,
        history: visitPage(old.history, {
          url: remoteLocation,
          title: pageLabel(remoteLocation),
          visited: Date.now(),
        }),
      }));
  }, [remoteLocation, updateLibrary]);
  useEffect(() => {
    if (active && start) address.current?.focus();
  }, [active, start]);
  useEffect(() => {
    void fs
      .search("/home/guest", 300)
      .then((rows) =>
        setLocalApps(rows.filter((f) => /\.html?$/i.test(f.name))),
      )
      .catch(() => {});
  }, [version]);
  useEffect(() => {
    let live = true;
    let disposeApp: (() => void) | undefined;
    setError("");
    setNotice("");
    setHtml(undefined);
    setLoading(!start);
    const controller = new AbortController();
    abort.current = controller;
    if (!start)
      updateLibrary((old) => ({
        ...old,
        history: visitPage(old.history, {
          url,
          title: pageLabel(url),
          visited: Date.now(),
        }),
      }));
    if (local)
      void loadLocalApp(url)
        .then((app) => {
          if (live) {
            disposeApp = app.dispose;
            setHtml(app.html);
            setLoading(false);
          } else app.dispose();
        })
        .catch((e) => {
          if (live) {
            setError(errorMessage(e));
            setLoading(false);
          }
        });
    if (!local && !start && webMode === "document")
      void fetch("/api/browser?url=" + encodeURIComponent(url), {
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not load page.");
          return data as { html: string; url: string; title?: string };
        })
        .then((data) => {
          if (live) {
            setHtml(data.html);
            setLoading(false);
            if (data.url !== url) {
              setHistory((old) =>
                old.map((item, i) => (i === index ? data.url : item)),
              );
            }
          }
        })
        .catch((e) => {
          if (live && !controller.signal.aborted) {
            setError(errorMessage(e));
            setLoading(false);
          }
        });
    const timeout = window.setTimeout(() => {
      if (live && webMode === "live")
        setNotice(
          "If this page stays blank, its site may block embedding. Switch to Document mode to read it here.",
        );
    }, 8000);
    return () => {
      live = false;
      disposeApp?.();
      controller.abort();
      clearTimeout(timeout);
    };
  }, [url, reload, local, start, webMode, updateLibrary, index]);
  useEffect(() => {
    onTitle(pageLabel(url));
    onAddress(url);
  }, [url]); // Title callback changes as tabs render; URL is the trigger.
  const navigate = (value: string) => {
    try {
      const next = browserTarget(value);
      if (
        !next.startsWith("/") &&
        next !== "oma:start" &&
        new URL(next).origin === location.origin
      )
        throw new Error(
          "The desktop cannot be embedded inside itself. Open a local HTML app from Files instead.",
        );
      setRemoteLocation("");
      setInput(next);
      if (isRemote && /^https?:/.test(next)) remote.current?.navigate(next);
      setHistory((old) => [...old.slice(0, index + 1), next]);
      setIndex(index + 1);
      setPanel(null);
      useDesktop.setState((s) => ({
        tiles: { ...s.tiles, [id]: { ...s.tiles[id], path: next } },
      }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    const handle = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (
        event.data?.type === "oma:web-navigate" &&
        typeof event.data.url === "string"
      ) {
        if (
          local &&
          event.data.url.startsWith("/") &&
          !fs
            .normalize(event.data.url)
            .startsWith(url.slice(0, url.lastIndexOf("/")) + "/")
        ) {
          setNotice(
            "Local apps can navigate only within their own folder. Use the address bar to open another file.",
          );
          return;
        }
        if (event.data.newTab) openTab(event.data.url);
        else navigate(event.data.url);
      }
      if (event.data?.type === "oma:web-error")
        setNotice(String(event.data.message));
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  });
  const savePage = async () => {
    if (isRemote && remote.current) {
      try {
        const blob = await remote.current.screenshot();
        await fs.mkdir("/home/guest/Downloads");
        await fs.writeBlob(
          "/home/guest/Downloads/" +
            snapshotName(currentURL).replace(/\.html$/, ".jpg"),
          blob,
          { overwrite: false },
        );
        useDesktop.getState().refreshFs();
        setNotice(
          "Screenshot saved in Downloads. Open it in Files to view or export.",
        );
      } catch (e) {
        setNotice(errorMessage(e));
      }
      return;
    }
    if (!html) return;
    try {
      await fs.mkdir("/home/guest/Downloads");
      const output = "/home/guest/Downloads/" + snapshotName(url);
      await fs.write(output, html);
      useDesktop.getState().refreshFs();
      setNotice(
        "Saved in Downloads. Open it from Files or the browser start page.",
      );
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const toggleBookmark = () =>
    updateLibrary((old) => ({
      ...old,
      bookmarks: bookmarked
        ? old.bookmarks.filter((e) => e.url !== currentURL)
        : visitPage(old.bookmarks, {
            url: currentURL,
            title: pageLabel(currentURL),
            visited: Date.now(),
          }),
    }));
  return (
    <div className="browser-app">
      <form
        className="browser-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(input);
        }}
      >
        <button
          type="button"
          aria-label="Browser back"
          title="Back"
          disabled={!isRemote && index === 0}
          onClick={() =>
            isRemote ? remote.current?.action("back") : setIndex(index - 1)
          }
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          aria-label="Browser forward"
          title="Forward"
          disabled={!isRemote && index === history.length - 1}
          onClick={() =>
            isRemote ? remote.current?.action("forward") : setIndex(index + 1)
          }
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          aria-label={loading && !isRemote ? "Stop loading" : "Reload page"}
          title={loading && !isRemote ? "Stop loading" : "Reload"}
          onClick={() => {
            if (isRemote) {
              remote.current?.action("reload");
              return;
            }
            if (loading) {
              abort.current?.abort();
              setLoading(false);
              setNotice("Loading stopped.");
            } else setReload((n) => n + 1);
          }}
        >
          {loading && !isRemote ? <X size={14} /> : <RotateCw size={14} />}
        </button>
        <div className="browser-address">
          <Globe size={12} />
          <input
            ref={address}
            aria-label="Browser address"
            placeholder="Search or enter a URL"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          aria-label="Browser home"
          title="Home"
          onClick={() => navigate("oma:start")}
        >
          <Home size={14} />
        </button>
      </form>
      <div className="browser-tools">
        <button
          aria-pressed={panel === "bookmarks"}
          onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")}
        >
          <Star size={13} />
          Bookmarks
        </button>
        <button
          aria-pressed={panel === "history"}
          onClick={() => setPanel(panel === "history" ? null : "history")}
        >
          <History size={13} />
          History
        </button>
        {!start && (
          <button
            aria-label="Copy page address"
            title="Copy page address"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(currentURL);
                setNotice("Page address copied.");
              } catch {
                setNotice(
                  "Select the address above and copy it with your keyboard.",
                );
              }
            }}
          >
            <Copy size={13} />
          </button>
        )}
        {!start && (
          <button
            title={bookmarked ? "Remove bookmark" : "Bookmark page"}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark page"}
            onClick={toggleBookmark}
          >
            <Star size={13} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        )}
        {local ? (
          <button onClick={() => useDesktop.getState().launch("editor", url)}>
            <Code2 size={13} />
            Source
          </button>
        ) : (
          !start && (
            <>
              <label className="browser-mode">
                <BookOpen size={13} />
                <select
                  aria-label="Browser rendering mode"
                  value={webMode}
                  onChange={(event) =>
                    setWebMode(
                      event.target.value as "remote" | "document" | "live",
                    )
                  }
                >
                  <option value="remote" disabled={!runtime}>
                    Chromium
                  </option>
                  <option value="document">Document</option>
                  <option value="live">Live embed</option>
                </select>
              </label>
              <button
                disabled={!html && !isRemote}
                title={
                  isRemote
                    ? "Save a screenshot to Downloads"
                    : "Save a readable copy to Downloads"
                }
                aria-label={
                  isRemote
                    ? "Save screenshot to Downloads"
                    : "Save page to Downloads"
                }
                onClick={() => void savePage()}
              >
                <Download size={13} />
              </button>
            </>
          )
        )}
      </div>
      {notice && (
        <div className="browser-notice" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss browser message"
            onClick={() => setNotice("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="browser-workarea">
        {panel && (
          <aside className="browser-library">
            <div className="browser-library-heading">
              <strong>{panel === "bookmarks" ? "Bookmarks" : "History"}</strong>
              <button
                aria-label="Close browser library"
                onClick={() => setPanel(null)}
              >
                <X size={14} />
              </button>
            </div>
            <label className="browser-library-search">
              <Search size={13} />
              <input
                aria-label="Filter browser library"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter pages"
              />
            </label>
            <div className="browser-library-list">
              {library[panel]
                .filter((e) =>
                  (e.title + " " + e.url)
                    .toLowerCase()
                    .includes(filter.toLowerCase()),
                )
                .map((entry) => (
                  <div className="browser-library-entry" key={entry.url}>
                    <button onClick={() => navigate(entry.url)}>
                      <strong>{entry.title}</strong>
                      <span>{entry.url}</span>
                    </button>
                    {panel === "bookmarks" && (
                      <button
                        aria-label={"Remove bookmark " + entry.title}
                        onClick={() =>
                          updateLibrary((old) => ({
                            ...old,
                            bookmarks: old.bookmarks.filter(
                              (e) => e.url !== entry.url,
                            ),
                          }))
                        }
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              {!library[panel].length && <p>No {panel} yet.</p>}
            </div>
            {panel === "history" && library.history.length > 0 && (
              <button
                className="browser-clear-history"
                onClick={() =>
                  updateLibrary((old) => ({ ...old, history: [] }))
                }
              >
                Clear history
              </button>
            )}
          </aside>
        )}
        <div className="browser-content">
          {error ? (
            <div className="browser-error">
              <Globe size={25} />
              <h2>Could not open this page</h2>
              <p>{error}</p>
              <button
                onClick={() => {
                  setError("");
                  setReload((n) => n + 1);
                }}
              >
                Try again
              </button>
              {!local && !start && (
                <button
                  onClick={() => {
                    setError("");
                    setWebMode((mode) =>
                      mode === "document" ? "live" : "document",
                    );
                  }}
                >
                  Try {webMode === "document" ? "Live" : "Document"} mode
                </button>
              )}
            </div>
          ) : start ? (
            <div className="browser-start">
              <Globe size={29} />
              <h1>A window to the web.</h1>
              <p>Read, research, and run your own apps.</p>
              <div className="browser-quicklinks">
                {[
                  ["Wikipedia", "https://en.wikipedia.org/wiki/Main_Page"],
                  ["Hacker News", "https://news.ycombinator.com/"],
                  ["MDN", "https://developer.mozilla.org/en-US/"],
                  ["Internet Archive", "https://archive.org/"],
                ].map(([title, target]) => (
                  <button key={target} onClick={() => navigate(target)}>
                    <Globe size={14} />
                    {title}
                  </button>
                ))}
              </div>
              {library.bookmarks.length > 0 && (
                <>
                  <div className="browser-section">
                    BOOKMARKS <span>{library.bookmarks.length}</span>
                  </div>
                  <div className="browser-quicklinks">
                    {library.bookmarks.slice(0, 6).map((entry) => (
                      <button
                        key={entry.url}
                        onClick={() => navigate(entry.url)}
                      >
                        <Star size={13} />
                        {entry.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="browser-section">
                LOCAL APPS & SAVED PAGES <span>{localApps.length}</span>
              </div>
              {localApps.map((app) => (
                <button
                  className="local-app-row"
                  key={app.path}
                  onClick={() => navigate(app.path)}
                >
                  <Code2 size={17} />
                  <div>
                    <strong>{app.name.replace(/\.html?$/i, "")}</strong>
                    <span>{app.path}</span>
                  </div>
                  <Play size={13} />
                </button>
              ))}
              {!localApps.length && (
                <div className="browser-empty">
                  Save an HTML file in Projects to run it here.
                </div>
              )}
              <div className="browser-footnote">
                <ShieldCheck size={14} />
                <span>
                  Local apps are isolated. Document mode removes website scripts
                  and keeps links inside oma.os.
                </span>
              </div>
            </div>
          ) : webMode === "remote" && !local ? (
            <RemoteBrowser
              ref={remote}
              url={url}
              active={active}
              onReadDocument={() => {
                if (remoteLocation) navigate(remoteLocation);
                setWebMode("document");
              }}
              onLocation={(next, title) => {
                setRemoteLocation((old) => (old === next ? old : next));
                onAddress(next);
                if (document.activeElement !== address.current) setInput(next);
                setLoading(false);
                onTitle(title || pageLabel(next));
              }}
            />
          ) : local || webMode === "document" ? (
            html !== undefined ? (
              <iframe
                ref={frame}
                key={url + reload}
                title={local ? "Local app" : "Web page"}
                data-oma-local="true"
                srcDoc={html}
                sandbox={
                  local
                    ? "allow-scripts allow-forms allow-downloads"
                    : "allow-scripts allow-forms"
                }
              />
            ) : (
              <div className="loading-client">
                {loading ? "Loading page…" : "Page loading stopped."}
              </div>
            )
          ) : (
            <iframe
              ref={frame}
              key={url + reload}
              title="Web page"
              src={embedURL(url)}
              sandbox="allow-scripts allow-forms allow-same-origin"
              referrerPolicy="no-referrer"
              onLoad={() => setLoading(false)}
            />
          )}
        </div>
      </div>
      <div className="browser-status">
        <span>
          {start
            ? "Ready"
            : loading
              ? "Loading…"
              : local
                ? "Local app · isolated"
                : webMode === "remote"
                  ? "Chromium · isolated session"
                  : webMode === "document"
                    ? "Document · public page"
                    : "Live · embedded site"}
        </span>
        <span>
          {local
            ? "Source → save → reload"
            : webMode === "remote"
              ? "Rendered by a real browser"
              : webMode === "document"
                ? "Links stay here · sign-in unavailable"
                : "Sites control embedding support"}
        </span>
      </div>
    </div>
  );
}
