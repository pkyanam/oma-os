export type BrowserEntry = { url: string; title: string; visited: number };
export type BrowserLibrary = {
  bookmarks: BrowserEntry[];
  history: BrowserEntry[];
};
export const LIBRARY_KEY = "oma-browser-library-v1";
export function pageLabel(url: string) {
  if (url === "oma:start") return "Start page";
  if (url.startsWith("/")) return url.split("/").pop() || "Local app";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
export function validEntry(value: unknown): value is BrowserEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as BrowserEntry;
  return (
    typeof e.url === "string" &&
    e.url.length <= 4096 &&
    /^(https?:\/\/|\/home\/|\/\.oma\/)/.test(e.url) &&
    typeof e.title === "string" &&
    e.title.length <= 300 &&
    Number.isFinite(e.visited)
  );
}
export function readLibrary(raw: string | null): BrowserLibrary {
  try {
    const data = JSON.parse(raw || "{}");
    return {
      bookmarks: Array.isArray(data.bookmarks)
        ? data.bookmarks.filter(validEntry).slice(0, 200)
        : [],
      history: Array.isArray(data.history)
        ? data.history.filter(validEntry).slice(0, 200)
        : [],
    };
  } catch {
    return { bookmarks: [], history: [] };
  }
}
export function visitPage(entries: BrowserEntry[], entry: BrowserEntry) {
  return [entry, ...entries.filter((e) => e.url !== entry.url)].slice(0, 200);
}
export function snapshotName(url: string, now = Date.now()) {
  return `${pageLabel(url)
    .replace(/[^a-z0-9._-]/gi, "-")
    .slice(0, 70)}-${now}.html`;
}

export type BrowserTab = { id: string; initial: string; title: string };
export function readTabs(
  raw: string | null,
  initial = "oma:start",
): { tabs: BrowserTab[]; selected: string } {
  const fallback = {
    tabs: [{ id: "first", initial, title: pageLabel(initial) }],
    selected: "first",
  };
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!Array.isArray(parsed.tabs)) return fallback;
    const ids = new Set<string>();
    const tabs = parsed.tabs
      .filter((tab: BrowserTab) => {
        if (
          !tab ||
          typeof tab.id !== "string" ||
          tab.id.length > 100 ||
          ids.has(tab.id) ||
          typeof tab.initial !== "string" ||
          tab.initial.length > 4096 ||
          typeof tab.title !== "string"
        )
          return false;
        if (
          tab.initial !== "oma:start" &&
          !/^(https?:\/\/|\/home\/|\/\.oma\/)/.test(tab.initial)
        )
          return false;
        ids.add(tab.id);
        return true;
      })
      .slice(0, 12)
      .map((tab: BrowserTab) => ({ ...tab, title: tab.title.slice(0, 300) }));
    if (!tabs.length) return fallback;
    return {
      tabs,
      selected: tabs.some((tab: BrowserTab) => tab.id === parsed.selected)
        ? parsed.selected
        : tabs[0].id,
    };
  } catch {
    return fallback;
  }
}
