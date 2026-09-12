"use client";
import { useEffect, useState, useRef, type MouseEvent } from "react";
import {
  Folder,
  FileText,
  Home,
  HardDrive,
  FilePlus2,
  FolderPlus,
  ArrowUp,
  Upload,
  Download,
  Copy,
  Scissors,
  ClipboardPaste,
  Pencil,
  Trash2,
  Search,
  Play,
  X,
  Image as ImageIcon,
  Music,
  Film,
} from "lucide-react";
import { fs, errorMessage, type Entry } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import {
  appForPath,
  fileKind,
  formatBytes,
  joinPath,
  validName,
} from "@/lib/files/kinds";
import {
  importFiles,
  downloadBlob,
  copyEntry,
  moveEntry,
  removeTree,
  uniquePath,
  assertMutable,
} from "@/lib/files/operations";
import {
  archiveEntries,
  extractArchive,
  MAX_ARCHIVE_BYTES,
} from "@/lib/files/archive";
import "./styles/files-media.css";
type Action = "file" | "directory" | "rename" | "delete" | "move" | null;
export default function Files({ active, path: initialPath }: { active: boolean; path?: string }) {
  const rootRef = useRef<HTMLDivElement>(null),
    listRef = useRef<HTMLDivElement>(null),
    importRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("/home/guest"),
    [entries, setEntries] = useState<Entry[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [action, setAction] = useState<Action>(null),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    [clipboard, setClipboard] = useState<{
      entries: Entry[];
      cut: boolean;
    } | null>(null);
  const version = useDesktop((s) => s.fsVersion);
  useEffect(() => {
    if (initialPath) { setPath(fs.normalize(initialPath)); setSelected([]); setQuery(''); }
  }, [initialPath]);
  const rows = entries.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  );
  const chosen = entries.filter((e) => selected.includes(e.path));
  useEffect(() => {
    if (active && !rootRef.current?.contains(document.activeElement))
      listRef.current?.focus();
  }, [active]);
  useEffect(() => {
    let live = true;
    fs.ls(path)
      .then((data) => {
        if (live) {
          setEntries(data);
          setSelected((old) =>
            old.filter((p) => data.some((e) => e.path === p)),
          );
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  const navigate = (p: string) => {
    setPath(p);
    setSelected([]);
    setQuery("");
    setAction(null);
  };
  const up = () => navigate(path.split("/").slice(0, -1).join("/") || "/");
  const open = (entry: Entry) =>
    entry.kind === "directory"
      ? navigate(entry.path)
      : useDesktop.getState().launch(appForPath(entry.path), entry.path);
  const protectOpen = (items: Entry[]) => {
    const state = useDesktop.getState();
    for (const tile of Object.values(state.tiles))
      if (
        ['editor', 'notes', 'canvas', 'tasks', 'lab', 'data', 'draw', 'database'].includes(tile.app) &&
        tile.path &&
        items.some(
          (e) => tile.path === e.path || tile.path!.startsWith(e.path + "/"),
        )
      )
        throw new Error(
          "Close the document’s window before moving or deleting it. This keeps open buffers safe.",
        );
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      useDesktop.getState().refreshFs();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const importPicked = (files: File[]) =>
    run(async () => {
      await importFiles(path, files, fs, (done, total) =>
        setStatus(`Importing ${done} of ${total}`),
      );
      setStatus(
        `Imported ${files.length} file${files.length === 1 ? "" : "s"}. Existing names were kept.`,
      );
    });
  const select = (entry: Entry, e: MouseEvent) => {
    listRef.current?.focus();
    if (e.metaKey || e.ctrlKey)
      setSelected((old) =>
        old.includes(entry.path)
          ? old.filter((p) => p !== entry.path)
          : [...old, entry.path],
      );
    else if (e.shiftKey && selected.length) {
      const a = rows.findIndex((r) => r.path === selected[0]),
        b = rows.indexOf(entry);
      setSelected(
        rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.path),
      );
    } else setSelected([entry.path]);
  };
  const paste = () =>
    run(async () => {
      if (!clipboard) return;
      if (clipboard.cut) protectOpen(clipboard.entries);
      for (const entry of clipboard.entries) {
        const target = await uniquePath(path, entry.name);
        if (clipboard.cut) await moveEntry(entry, target);
        else await copyEntry(entry, target);
      }
      setStatus(
        `${clipboard.entries.length} item(s) ${clipboard.cut ? "moved" : "copied"}.`,
      );
      if (clipboard.cut) setClipboard(null);
    });
  const submitAction = () =>
    run(async () => {
      if (action === "delete") {
        protectOpen(chosen);
        for (const entry of chosen) assertMutable(entry.path);
        for (const entry of chosen) await removeTree(entry);
        setSelected([]);
        setStatus("Items deleted.");
      } else if (action === "rename" && chosen[0]) {
        protectOpen(chosen);
        await moveEntry(chosen[0], joinPath(path, validName(name)));
        setStatus("Renamed.");
      } else if (action === "move") {
        protectOpen(chosen);
        const destination = fs.normalize(name);
        const dir = await fs.stat(destination);
        if (dir.kind !== "directory")
          throw new Error("Destination must be an existing folder.");
        for (const entry of chosen)
          await moveEntry(entry, joinPath(destination, entry.name));
        setStatus("Items moved.");
      } else {
        const target = joinPath(path, validName(name));
        if (await fs.exists(target))
          throw new Error("An item already has that name.");
        if (action === "directory") await fs.mkdir(target);
        else await fs.writeBlob(target, new Blob([]), { overwrite: false });
        setStatus("Created.");
      }
      setAction(null);
      setName("");
    });
  const download = () =>
    run(async () => {
      if (chosen.length === 1 && chosen[0].kind === "file") {
        downloadBlob(await fs.readBlob(chosen[0].path), chosen[0].name);
        return;
      }
      const archive: Record<string, Uint8Array> = {};
      let bytes = 0;
      const collect = async (entry: Entry, key: string) => {
        if (Object.keys(archive).length >= 5000)
          throw new Error(
            "Export exceeds 5,000 entries. Choose fewer folders.",
          );
        if (entry.kind === "directory") {
          archive[key + "/"] = new Uint8Array();
          for (const child of await fs.ls(entry.path))
            await collect(child, key + "/" + child.name);
        } else {
          const blob = await fs.readBlob(entry.path);
          bytes += blob.size;
          if (bytes > MAX_ARCHIVE_BYTES)
            throw new Error("Export exceeds 128 MB. Choose fewer items.");
          archive[key] = new Uint8Array(await blob.arrayBuffer());
        }
      };
      for (const entry of chosen) await collect(entry, entry.name);
      downloadBlob(
        new Blob([(await archiveEntries(archive)) as Uint8Array<ArrayBuffer>], {
          type: "application/zip",
        }),
        "oma-files.zip",
      );
      setStatus("ZIP downloaded.");
    });
  const unzip = () =>
    run(async () => {
      const entry = chosen[0];
      if (!entry) return;
      const items = await extractArchive(
        new Uint8Array(await (await fs.readBlob(entry.path)).arrayBuffer()),
      );
      const dest = await uniquePath(
        path,
        entry.name.replace(/\.zip$/i, "") + " extracted",
      );
      await fs.mkdir(dest);
      for (const [key, data] of Object.entries(items)) {
        const target = dest + "/" + key;
        if (key.endsWith("/")) {
          await fs.mkdir(target);
          continue;
        }
        await fs.mkdir(target.split("/").slice(0, -1).join("/"));
        await fs.writeBlob(
          target,
          new Blob([data as Uint8Array<ArrayBuffer>]),
          { overwrite: false },
        );
      }
      setStatus("Archive extracted into a new folder.");
    });
  const begin = (next: Action) => {
    setAction(next);
    setName(
      next === "rename"
        ? chosen[0]?.name || ""
        : next === "move"
          ? "/home/guest"
          : "",
    );
    setError("");
  };
  return (
    <div
      className={`files-app files-enhanced ${dragging ? "files-dragging" : ""}`}
      ref={rootRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importPicked(Array.from(e.dataTransfer.files));
      }}
    >
      <nav className="file-tree" aria-label="Places">
        <div className="section-label">PLACES</div>
        {[
          { p: "/home/guest", title: "guest", icon: Home },
          { p: "/home/guest/Projects", title: "Projects", icon: Folder },
          { p: "/home/guest/Documents", title: "Documents", icon: Folder },
          { p: "/.oma", title: ".oma", icon: Folder },
          { p: "/", title: "Filesystem", icon: HardDrive },
        ].map(({ p, title, icon: Icon }) => (
          <button
            key={p}
            className={`tree-row ${path === p ? "selected" : ""}`}
            onClick={() => navigate(p)}
          >
            <Icon size={15} />
            {title}
          </button>
        ))}
        <div className="tree-note">
          LOCAL FILES
          <br />
          <span>
            Drop files to import.
            <br />
            Download to keep a backup.
          </span>
        </div>
      </nav>
      <div className="file-list">
        <div className="file-location">
          <button
            title="Parent directory"
            aria-label="Parent directory"
            onClick={up}
            disabled={path === "/"}
          >
            <ArrowUp size={15} />
          </button>
          <span title={path}>{path}</span>
          <div className="file-actions">
            <button
              aria-label="New file"
              title="New file"
              disabled={busy}
              onClick={() => begin("file")}
            >
              <FilePlus2 size={15} />
            </button>
            <button
              aria-label="New folder"
              title="New folder"
              disabled={busy}
              onClick={() => begin("directory")}
            >
              <FolderPlus size={15} />
            </button>
            <button
              aria-label="Import files"
              title="Import files"
              disabled={busy}
              onClick={() => importRef.current?.click()}
            >
              <Upload size={15} />
            </button>
          </div>
        </div>
        <input
          ref={importRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void importPicked(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        <div className="files-search">
          <Search size={14} />
          <input
            aria-label="Filter files"
            placeholder="Filter this folder"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear filter" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </div>
        <div className="files-operation-bar" aria-label="File actions">
          <button
            disabled={busy || chosen.length !== 1}
            onClick={() => open(chosen[0])}
          >
            <Play size={13} />
            Open
          </button>
          <button
            title="Copy selected"
            aria-label="Copy selected"
            disabled={busy || !chosen.length}
            onClick={() => {
              setClipboard({ entries: chosen, cut: false });
              setStatus("Copied to the oma.os clipboard.");
            }}
          >
            <Copy size={14} />
          </button>
          <button
            title="Cut selected"
            aria-label="Cut selected"
            disabled={busy || !chosen.length}
            onClick={() => {
              setClipboard({ entries: chosen, cut: true });
              setStatus("Ready to move. Navigate to a folder and paste.");
            }}
          >
            <Scissors size={14} />
          </button>
          <button
            title="Paste"
            aria-label="Paste"
            disabled={busy || !clipboard}
            onClick={() => void paste()}
          >
            <ClipboardPaste size={14} />
          </button>
          <button
            title="Rename selected"
            aria-label="Rename selected"
            disabled={busy || chosen.length !== 1}
            onClick={() => begin("rename")}
          >
            <Pencil size={14} />
          </button>
          <button
            title="Download selected"
            aria-label="Download selected"
            disabled={busy || !chosen.length}
            onClick={() => void download()}
          >
            <Download size={14} />
          </button>
          <button
            title="Delete selected"
            aria-label="Delete selected"
            disabled={busy || !chosen.length}
            onClick={() => begin("delete")}
          >
            <Trash2 size={14} />
          </button>
          <button
            disabled={busy || !chosen.length}
            onClick={() => begin("move")}
          >
            Move…
          </button>
          {chosen.length === 1 && /\.zip$/i.test(chosen[0].name) && (
            <button disabled={busy} onClick={() => void unzip()}>
              Extract ZIP
            </button>
          )}
          {chosen.length === 1 &&
            chosen[0].kind === "file" &&
            ["html", "text"].includes(fileKind(chosen[0].path)) && (
              <button
                onClick={() =>
                  useDesktop.getState().launch("editor", chosen[0].path)
                }
              >
                Edit source
              </button>
            )}
        </div>
        {action && (
          <form
            className="files-confirm"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAction();
            }}
          >
            <strong>
              {action === "delete"
                ? `Delete ${chosen.length} item(s)?`
                : action === "move"
                  ? "Move to folder"
                  : action === "rename"
                    ? "Rename"
                    : "New " + action}
            </strong>
            {action === "delete" ? (
              <p>
                Folders and their contents will be permanently deleted. Download
                a backup first if needed.
              </p>
            ) : (
              <input
                autoFocus
                aria-label={
                  action === "move" ? "Destination folder" : "New name"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={action === "file" ? "filename.txt" : "Folder name"}
              />
            )}
            <div>
              <button type="submit" disabled={busy}>
                {action === "delete" ? "Delete permanently" : "Save"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && (
          <div className="file-error" role="alert">
            {error}
          </div>
        )}
        <div
          className="file-rows"
          ref={listRef}
          role="listbox"
          aria-label="Files"
          aria-multiselectable="true"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" && chosen[0]) open(chosen[0]);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const index = rows.findIndex((r) => r.path === selected.at(-1)),
                next = Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    index + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                );
              if (rows[next]) setSelected([rows[next].path]);
            }
            if (e.key === "Backspace") {
              e.preventDefault();
              up();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "a") {
              e.preventDefault();
              setSelected(rows.map((r) => r.path));
            }
            if (e.key === "F2" && chosen.length === 1) {
              e.preventDefault();
              begin("rename");
            }
          }}
        >
          {rows.map((entry) => {
            const kind = fileKind(entry.name),
              Icon =
                entry.kind === "directory"
                  ? Folder
                  : kind === "image"
                    ? ImageIcon
                    : kind === "audio"
                      ? Music
                      : kind === "video"
                        ? Film
                        : FileText;
            return (
              <div
                key={entry.path}
                role="option"
                aria-selected={selected.includes(entry.path)}
                className={`file-row ${selected.includes(entry.path) ? "selected" : ""}`}
                onClick={(e) => select(entry, e)}
                onDoubleClick={() => open(entry)}
              >
                <Icon
                  size={15}
                  className={entry.kind === "directory" ? "folder-icon" : ""}
                />
                <span title={entry.name}>{entry.name}</span>
                <span className="file-size">
                  {entry.kind === "directory"
                    ? "Folder"
                    : formatBytes(entry.size || 0)}
                </span>
                <button
                  className="file-row-open"
                  aria-label={`Open ${entry.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    open(entry);
                  }}
                >
                  <Play size={12} />
                </button>
              </div>
            );
          })}
          {!rows.length && !error && (
            <div className="folder-empty">
              {query ? "No matching files." : "This folder is empty."}
              <br />
              <span>
                {query
                  ? "Try a different name."
                  : "Drop files here or use Import files."}
              </span>
            </div>
          )}
        </div>
        <div className="client-footer">
          <span>
            {busy
              ? "Working…"
              : selected.length
                ? `${selected.length} selected`
                : `${entries.length} items`}
          </span>
          <span title={status}>{status || "Double-click or select Open"}</span>
        </div>
      </div>
      {dragging && (
        <div className="files-drop-cover">
          <Upload size={30} />
          <span>Import into {path}</span>
          <small>Files stay in this browser.</small>
        </div>
      )}
    </div>
  );
}
