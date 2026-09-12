"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  Download,
  Upload,
  Pin,
  Archive,
  BookOpen,
  Pencil,
  CalendarDays,
  PanelLeft,
  FileText,
} from "lucide-react";
import Markdown from "./Markdown";
import { useDocument } from "@/lib/apps/creative/useDocument";
import {
  welcomeNotebook,
  parseNotebook,
  downloadText,
  safeFilename,
  type Note,
} from "@/lib/apps/creative/model";
import "./creative.css";
type NoteView = {
  selected: string;
  preview: boolean;
  archived: boolean;
  sidebar: "auto" | "open" | "closed";
};
function readNoteView(path: string): NoteView {
  const fallback: NoteView = {
    selected: "",
    preview: false,
    archived: false,
    sidebar: "auto",
  };
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("oma-notes-view:" + path) || "null",
    );
    if (!value || typeof value !== "object") return fallback;
    const v = value as Record<string, unknown>;
    return {
      selected: typeof v.selected === "string" ? v.selected.slice(0, 100) : "",
      preview: v.preview === true,
      archived: v.archived === true,
      sidebar:
        v.sidebar === "open" || v.sidebar === "closed" ? v.sidebar : "auto",
    };
  } catch {
    return fallback;
  }
}
export default function Notes({
  id,
  active,
  path = "/home/guest/Documents/Notebook.oma-notes.json",
}: {
  id: string;
  active: boolean;
  path?: string;
}) {
  const doc = useDocument(id, path, welcomeNotebook, parseNotebook);
  const [initialView] = useState(() => readNoteView(path));
  const [loadedPath, setLoadedPath] = useState(path);
  const [selected, setSelected] = useState(initialView.selected),
    [query, setQuery] = useState(""),
    [preview, setPreview] = useState(initialView.preview),
    [archived, setArchived] = useState(initialView.archived),
    [sidebar, setSidebar] = useState<"auto" | "open" | "closed">(
      initialView.sidebar,
    ),
    [importError, setImportError] = useState("");
  useEffect(() => {
    if (loadedPath === path) return;
    const view = readNoteView(path);
    setSelected(view.selected);
    setPreview(view.preview);
    setArchived(view.archived);
    setSidebar(view.sidebar);
    setQuery("");
    setLoadedPath(path);
  }, [path, loadedPath]);
  useEffect(() => {
    if (loadedPath !== path) return;
    try {
      localStorage.setItem(
        "oma-notes-view:" + path,
        JSON.stringify({ selected, preview, archived, sidebar }),
      );
    } catch {
      /* Preferences are optional when storage is full or disabled. */
    }
  }, [path, loadedPath, selected, preview, archived, sidebar]);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const notes = doc.value.notes
    .filter(
      (n) =>
        n.archived === archived &&
        (n.title + " " + n.body).toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated,
    );
  const note = notes.find((n) => n.id === selected) ?? notes[0];
  useEffect(() => {
    if (doc.ready && loadedPath === path && note && note.id !== selected)
      setSelected(note.id);
  }, [doc.ready, loadedPath, path, note, selected]);
  const edit = (patch: Partial<Note>) => {
    if (note)
      doc.update((old) => ({
        ...old,
        notes: old.notes.map((n) =>
          n.id === note.id ? { ...n, ...patch, updated: Date.now() } : n,
        ),
      }));
  };
  const add = (kind: "blank" | "daily" | "brief" = "blank") => {
    if (doc.value.notes.length >= 5000) {
      setImportError(
        "This notebook has reached its 5,000 note limit. Export notes before starting another notebook.",
      );
      return;
    }
    const today = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (kind === "daily") {
      const found = doc.value.notes.find((n) => n.title === today);
      if (found) {
        if (found.archived)
          doc.update((old) => ({
            ...old,
            notes: old.notes.map((n) =>
              n.id === found.id ? { ...n, archived: false } : n,
            ),
          }));
        setSelected(found.id);
        setQuery("");
        setArchived(false);
        return;
      }
    }
    const n: Note = {
      id: crypto.randomUUID(),
      title:
        kind === "daily"
          ? today
          : kind === "brief"
            ? "Project brief"
            : "Untitled note",
      body:
        kind === "daily"
          ? `# ${today}\n\n## One thing that matters\n\n\n## Notes\n\n\n## Done today\n\n- [ ] \n`
          : kind === "brief"
            ? "# Project brief\n\n## The problem\n\nWho is this for? What should change?\n\n## The approach\n\n\n## Success looks like\n\n- [ ] \n\n## Open questions\n\n"
            : "",
      updated: Date.now(),
      pinned: false,
      archived: false,
    };
    doc.update((old) => ({ ...old, notes: [n, ...old.notes] }));
    setSelected(n.id);
    setQuery("");
    setArchived(false);
    setPreview(false);
    setSidebar("auto");
  };
  return (
    <div
      className="creative-app notes-app"
      ref={root}
      onKeyDown={(e) => {
        if (active && (e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          void doc.flush();
        }
      }}
    >
      <header className="creative-toolbar">
        <button
          aria-label="Toggle note list"
          onClick={() =>
            setSidebar((current) =>
              current === "auto"
                ? root.current && root.current.clientWidth > 430
                  ? "closed"
                  : "open"
                : current === "closed"
                  ? "open"
                  : "closed",
            )
          }
        >
          <PanelLeft size={15} />
        </button>
        <strong>Notebook</strong>
        <span className="creative-spacer" />
        <button
          aria-label="New note"
          disabled={!doc.ready}
          onClick={() => add()}
        >
          <Plus size={16} />
        </button>
        <button
          title="Daily page"
          aria-label="Daily page"
          disabled={!doc.ready}
          onClick={() => add("daily")}
        >
          <CalendarDays size={16} />
        </button>
        <button
          title="Project brief"
          aria-label="Project brief"
          disabled={!doc.ready}
          onClick={() => add("brief")}
        >
          <FileText size={16} />
        </button>
        <button
          aria-label="Import Markdown"
          disabled={!doc.ready}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
        </button>
      </header>
      <input
        ref={input}
        type="file"
        hidden
        accept=".md,.txt,text/plain,text/markdown"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (doc.value.notes.length >= 5000)
              throw new Error(
                "This notebook has reached its 5,000 note limit.",
              );
            if (file.size > 2_000_000)
              throw new Error("Notes must be smaller than 2 MB.");
            const n: Note = {
              id: crypto.randomUUID(),
              title: file.name.replace(/\.(md|txt)$/i, ""),
              body: await file.text(),
              updated: Date.now(),
              pinned: false,
              archived: false,
            };
            doc.update((old) => ({ ...old, notes: [n, ...old.notes] }));
            setSelected(n.id);
            setQuery("");
            setArchived(false);
            setImportError("");
          } catch (error) {
            setImportError(String(error));
          }
        }}
      />
      <div className="notes-layout">
        <aside
          className={
            "notes-list " + (sidebar === "auto" ? "" : "is-" + sidebar)
          }
        >
          <label className="creative-search">
            <Search size={14} />
            <input
              aria-label="Search notes"
              placeholder="Search everything"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="notes-list-tabs">
            <button aria-pressed={!archived} onClick={() => setArchived(false)}>
              Notes
            </button>
            <button aria-pressed={archived} onClick={() => setArchived(true)}>
              Archive
            </button>
          </div>
          <div className="notes-items">
            {notes.map((n) => (
              <button
                key={n.id}
                className={
                  "notes-item " + (n.id === note?.id ? "selected" : "")
                }
                onClick={() => {
                  setSelected(n.id);
                  setSidebar("auto");
                }}
              >
                <span>
                  {n.pinned && <Pin size={12} />}
                  <strong>{n.title || "Untitled note"}</strong>
                </span>
                <small>
                  {n.body.replace(/[#*`\[\]]/g, "").slice(0, 90) ||
                    "Start writing…"}
                </small>
                <time>
                  {new Date(n.updated).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </button>
            ))}
            {!notes.length && (
              <div className="creative-empty">
                {query
                  ? "No matching notes."
                  : archived
                    ? "Your archive is empty."
                    : "A fresh page is waiting."}
              </div>
            )}
          </div>
          <footer>
            {notes.length} {notes.length === 1 ? "note" : "notes"} · local only
          </footer>
        </aside>
        <main className="notes-editor">
          {note ? (
            <>
              <div className="note-title-row">
                <input
                  aria-label="Note title"
                  value={note.title}
                  maxLength={250}
                  onChange={(e) => edit({ title: e.target.value })}
                />
                <button
                  aria-label={note.pinned ? "Unpin note" : "Pin note"}
                  aria-pressed={note.pinned}
                  onClick={() => edit({ pinned: !note.pinned })}
                >
                  <Pin size={15} />
                </button>
                <button
                  aria-label={note.archived ? "Restore note" : "Archive note"}
                  onClick={() => {
                    edit({ archived: !note.archived });
                    setArchived(!note.archived);
                  }}
                >
                  <Archive size={15} />
                </button>
              </div>
              <div className="note-mode-row">
                <button
                  aria-pressed={!preview}
                  onClick={() => setPreview(false)}
                >
                  <Pencil size={13} />
                  Write
                </button>
                <button aria-pressed={preview} onClick={() => setPreview(true)}>
                  <BookOpen size={13} />
                  Preview
                </button>
                <span className="creative-spacer" />
                <button
                  aria-label="Export note as Markdown"
                  onClick={() =>
                    downloadText(
                      safeFilename(note.title) + ".md",
                      note.body,
                      "text/markdown",
                    )
                  }
                >
                  <Download size={14} /> .md
                </button>
              </div>
              {preview ? (
                <Markdown
                  className="notes-preview"
                  onTaskToggle={(sourceLine) => {
                    const line = sourceLine - 1;
                    const lines = note.body.split("\n");
                    lines[line] = lines[line].replace(/\[([ xX])\]/, (_, v) =>
                      v === " " ? "[x]" : "[ ]",
                    );
                    edit({ body: lines.join("\n") });
                  }}
                >
                  {note.body}
                </Markdown>
              ) : (
                <textarea
                  className="note-body"
                  aria-label="Note body"
                  spellCheck
                  maxLength={2_000_000}
                  value={note.body}
                  placeholder="Let the first sentence be imperfect."
                  onChange={(e) => edit({ body: e.target.value })}
                />
              )}
            </>
          ) : (
            <div className="creative-empty">
              <BookOpen size={32} />
              <p>A place for your next idea.</p>
              <button onClick={() => add()} disabled={!doc.ready}>
                Create a note
              </button>
            </div>
          )}
        </main>
      </div>
      {(doc.error || importError) && (
        <div className="creative-error" role="alert">
          {doc.error || importError}
          {doc.error && (
            <button onClick={() => void doc.reload()}>
              Reload disk version
            </button>
          )}
        </div>
      )}
      <footer className="creative-status">
        <span>{doc.status}</span>
        <span>
          {note?.body.trim().split(/\s+/).filter(Boolean).length ?? 0} words ·
          Markdown
        </span>
      </footer>
    </div>
  );
}
