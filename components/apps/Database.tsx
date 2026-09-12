"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Upload,
  Download,
  Database as DatabaseIcon,
  FileCode,
  RefreshCw,
} from "lucide-react";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import {
  DATABASE_PATH,
  SQL_DEMO,
  csvImport,
  sqlIdentifier,
  sqlCell,
  resultCSV,
  type SQLResult,
} from "@/lib/integrations/database";
import "./integrations.css";
type Reply = {
  id: number;
  ok: boolean;
  error?: string;
  snapshot?: Blob;
  tables?: string[];
  results?: SQLResult[];
};
export default function Database({
  id,
  active,
  path = "/home/guest/Documents/Workbench.sql",
}: {
  id: string;
  active: boolean;
  path?: string;
}) {
  const fsVersion = useDesktop((s) => s.fsVersion);
  const [sql, setSQL] = useState(SQL_DEMO),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Starting PostgreSQL…"),
    [error, setError] = useState(""),
    [results, setResults] = useState<SQLResult[]>([]),
    [resultIndex, setResultIndex] = useState(0),
    [tables, setTables] = useState<string[]>([]),
    [history, setHistory] = useState<string[]>([]),
    [tab, setTab] = useState<"tables" | "history">("tables"),
    [importPath, setImportPath] = useState(""),
    [showImport, setShowImport] = useState(false),
    [generation, setGeneration] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [unsavedCheckpoint, setUnsavedCheckpoint] = useState(false);
  const worker = useRef<Worker | null>(null),
    sequence = useRef(0),
    pending = useRef(
      new Map<
        number,
        {
          resolve: (reply: Reply) => void;
          reject: (error: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    ),
    upload = useRef<HTMLInputElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    disk = useRef<string | undefined>(undefined),
    latest = useRef(SQL_DEMO),
    dirty = useRef(false),
    queue = useRef(Promise.resolve()),
    alive = useRef(true),
    operation = useRef(false),
    checkpoint = useRef<Blob | null>(null);
  const request = useCallback(
    (body: Record<string, unknown>, timeout = 35000) =>
      new Promise<Reply>((resolve, reject) => {
        if (!worker.current) {
          reject(new Error("Database is disconnected."));
          return;
        }
        const requestId = ++sequence.current;
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          reject(
            new Error(
              "Database operation timed out. Reconnect to restore the last saved checkpoint.",
            ),
          );
          worker.current?.terminate();
          worker.current = null;
          setReady(false);
        }, timeout);
        pending.current.set(requestId, { resolve, reject, timer });
        worker.current.postMessage({ ...body, id: requestId });
      }),
    [],
  );
  const saveScript = useCallback(() => {
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!dirty.current) return;
        const text = latest.current;
        await fs.write(path, text, disk.current);
        disk.current = text;
        if (latest.current === text) dirty.current = false;
        useDesktop
          .getState()
          .setDirty(
            id,
            dirty.current || operation.current || !!checkpoint.current,
          );
        useDesktop.getState().refreshFs();
      });
    return queue.current;
  }, [id, path]);
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    void (async () => {
      try {
        await fs.mkdir(path.slice(0, path.lastIndexOf("/")));
        if (await fs.exists(path)) {
          const text = await fs.read(path);
          if (cancelled) return;
          disk.current = text;
          latest.current = text;
          setSQL(text);
        } else {
          await fs.writeBlob(path, new Blob([SQL_DEMO]), { overwrite: false });
          disk.current = SQL_DEMO;
          useDesktop.getState().refreshFs();
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      void saveScript().catch(() => {});
    };
  }, [path, saveScript]);
  useEffect(() => {
    if (dirty.current || disk.current === undefined) return;
    let cancelled = false;
    void fs
      .read(path)
      .then((text) => {
        if (cancelled || dirty.current || text === disk.current) return;
        disk.current = text;
        latest.current = text;
        setSQL(text);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fsVersion, path]);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(
      () => void saveScript().catch((e) => setError(errorMessage(e))),
      500,
    );
    return () => clearTimeout(timer);
  }, [sql, saveScript]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty.current || operation.current || !!checkpoint.current)
        e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    const lockAbort = new AbortController();
    setReady(false);
    setStatus("Starting PostgreSQL…");
    const start = async () => {
      try {
        if (cancelled) return;
        const instance = new Worker("/workers/database.js", { type: "module" });
        worker.current = instance;
        instance.onmessage = ({ data: reply }: { data: Reply }) => {
          const wait = pending.current.get(reply.id);
          if (!wait) return;
          pending.current.delete(reply.id);
          clearTimeout(wait.timer);
          if (reply.ok) wait.resolve(reply);
          else wait.reject(new Error(reply.error || "PostgreSQL failed."));
        };
        instance.onerror = () => {
          for (const wait of pending.current.values()) {
            clearTimeout(wait.timer);
            wait.reject(
              new Error(
                "Could not load the local PostgreSQL runtime. Check the deployment assets and reconnect.",
              ),
            );
          }
          pending.current.clear();
        };
        const snapshot = (await fs.exists(DATABASE_PATH))
          ? await fs.readBlob(DATABASE_PATH)
          : undefined;
        await request({ kind: "init", snapshot }, 120000);
        const data = await request({
          kind: "query",
          sql: "SELECT version() AS postgres_version",
        });
        if (cancelled) return;
        if (data.snapshot) await fs.writeBlob(DATABASE_PATH, data.snapshot);
        setTables(data.tables || []);
        setReady(true);
        setStatus("Ready · saved locally");
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
          setStatus("Disconnected");
        }
      }
    };
    if (navigator.locks) {
      setStatus("Waiting for database access…");
      void navigator.locks
        .request(
          "oma-pglite-workbench",
          { signal: lockAbort.signal },
          async () => {
            const held = new Promise<void>((resolve) => {
              release = resolve;
              if (cancelled) resolve();
            });
            if (!cancelled) setStatus("Starting PostgreSQL…");
            await start();
            await held;
          },
        )
        .catch((e) => {
          if (!cancelled) {
            setError(errorMessage(e));
            setStatus("Database unavailable");
          }
        });
    } else {
      setError(
        "This browser needs Web Locks for safe database persistence. Use a current browser on HTTPS.",
      );
      setStatus("Unavailable");
    }
    return () => {
      cancelled = true;
      lockAbort.abort();
      worker.current?.terminate();
      worker.current = null;
      for (const wait of pending.current.values()) {
        clearTimeout(wait.timer);
        wait.reject(new Error("Database was closed."));
      }
      pending.current.clear();
      release?.();
    };
  }, [generation, request]);
  const execute = async (body: Record<string, unknown>, query?: string) => {
    if (!ready || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setStatus("Running…");
    useDesktop.getState().setDirty(id, true);
    const start = performance.now();
    try {
      await saveScript();
      const reply = await request(body);
      if (reply.snapshot) {
        checkpoint.current = reply.snapshot;
        setUnsavedCheckpoint(true);
        setStatus("Saving checkpoint…");
        await fs.writeBlob(DATABASE_PATH, reply.snapshot);
        checkpoint.current = null;
        setUnsavedCheckpoint(false);
        useDesktop.getState().refreshFs();
      }
      setResults(reply.results || []);
      setResultIndex(Math.max(0, (reply.results?.length || 1) - 1));
      setTables(reply.tables || []);
      setElapsed(Math.round(performance.now() - start));
      if (reply.error) throw new Error(reply.error);
      if (query)
        setHistory((h) =>
          [query, ...h.filter((q) => q !== query)].slice(0, 30),
        );
      setStatus("Ready · saved locally");
    } catch (e) {
      setError(errorMessage(e));
      setStatus("Operation failed");
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
      useDesktop.getState().setDirty(id, dirty.current || !!checkpoint.current);
    }
  };
  const run = () => {
    const selection = editor.current?.value
      .slice(editor.current.selectionStart, editor.current.selectionEnd)
      .trim();
    const query = selection || sql;
    void execute({ kind: "query", sql: query }, query);
  };
  const importCSV = async (source: string, name: string) => {
    try {
      const payload = csvImport(source, name);
      setShowImport(false);
      await execute({ kind: "import", ...payload });
      setSQL(`SELECT * FROM ${sqlIdentifier(payload.name)} LIMIT 1000;`);
      latest.current = `SELECT * FROM ${sqlIdentifier(payload.name)} LIMIT 1000;`;
      dirty.current = true;
      useDesktop.getState().setDirty(id, true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const selected = results[resultIndex];
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    for (const wait of pending.current.values()) {
      clearTimeout(wait.timer);
      wait.reject(
        new Error(
          "Stopped. Reconnect restores the last saved database checkpoint.",
        ),
      );
    }
    pending.current.clear();
    setReady(false);
    setStatus("Stopped");
  };
  const saveCSV = async () => {
    if (!selected) return;
    try {
      const target = `/home/guest/Documents/Query-${Date.now()}.csv`;
      await fs.write(target, resultCSV(selected));
      useDesktop.getState().refreshFs();
      setStatus("Results saved to " + target.split("/").pop());
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div
      className="native-integration database-integration"
      onKeyDown={(e) => {
        if (!active) return;
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          run();
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void saveScript()
            .then(() => setStatus("SQL saved locally"))
            .catch((err) => setError(errorMessage(err)));
        }
      }}
    >
      <header className="integration-toolbar">
        <strong>
          <DatabaseIcon size={15} />
          SQL Workbench
        </strong>
        <span className="integration-path" title={path}>
          {path.split("/").pop()}
        </span>
        {unsavedCheckpoint && (
          <button
            onClick={() => {
              if (checkpoint.current)
                void fs
                  .writeBlob(DATABASE_PATH, checkpoint.current)
                  .then(() => {
                    checkpoint.current = null;
                    setUnsavedCheckpoint(false);
                    setError("");
                    setStatus("Checkpoint saved locally");
                    useDesktop
                      .getState()
                      .setDirty(id, dirty.current || operation.current);
                    useDesktop.getState().refreshFs();
                  })
                  .catch((e) => setError(errorMessage(e)));
            }}
          >
            Retry checkpoint save
          </button>
        )}
        {ready ? (
          <button className="integration-primary" disabled={busy} onClick={run}>
            <Play size={14} />
            Run SQL
          </button>
        ) : (
          <button
            disabled={unsavedCheckpoint || busy}
            onClick={() => {
              setError("");
              setGeneration((g) => g + 1);
            }}
          >
            <RefreshCw size={14} />
            Reconnect
          </button>
        )}
        {busy && (
          <button onClick={stop}>
            <Square size={14} />
            Stop
          </button>
        )}
        <button
          disabled={!ready || busy}
          onClick={() => setShowImport((v) => !v)}
        >
          <Upload size={14} />
          Import CSV
        </button>
        <button
          disabled={!selected?.fields.length || busy}
          onClick={() => void saveCSV()}
        >
          <Download size={14} />
          Save results
        </button>
      </header>
      {showImport && (
        <div className="database-import">
          <button onClick={() => upload.current?.click()}>
            Choose CSV from device
          </button>
          <span>or</span>
          <input
            aria-label="CSV file path"
            placeholder="/home/guest/Documents/data.csv"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
          />
          <button
            onClick={() =>
              void fs
                .read(importPath)
                .then((text) =>
                  importCSV(text, importPath.split("/").pop() || "data"),
                )
                .catch((e) => setError(errorMessage(e)))
            }
          >
            Import from Files
          </button>
          <small>
            Each import creates a new table; existing tables are preserved.
            Columns start as TEXT; use PostgreSQL casts in queries.
          </small>
        </div>
      )}
      <input
        hidden
        type="file"
        accept=".csv,text/csv"
        ref={upload}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 2_000_000) throw new Error("CSV limit is 2 MB.");
            await importCSV(await file.text(), file.name);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      />
      <div className="database-body">
        <aside className="database-sidebar">
          <nav>
            <button
              aria-pressed={tab === "tables"}
              onClick={() => setTab("tables")}
            >
              Tables
            </button>
            <button
              aria-pressed={tab === "history"}
              onClick={() => setTab("history")}
            >
              History
            </button>
          </nav>
          {tab === "tables" ? (
            tables.length ? (
              tables.map((name) => (
                <button
                  key={name}
                  title={name}
                  onClick={() => {
                    const text = `SELECT * FROM ${sqlIdentifier(name)} LIMIT 1000;`;
                    setSQL(text);
                    latest.current = text;
                    dirty.current = true;
                    useDesktop.getState().setDirty(id, true);
                  }}
                >
                  <DatabaseIcon size={13} />
                  {name}
                </button>
              ))
            ) : (
              <p>
                Run the example to create your first table, or import a CSV.
              </p>
            )
          ) : history.length ? (
            history.map((query, i) => (
              <button
                key={i}
                title={query}
                onClick={() => {
                  setSQL(query);
                  latest.current = query;
                  dirty.current = true;
                  useDesktop.getState().setDirty(id, true);
                }}
              >
                <FileCode size={13} />
                {query.slice(0, 90)}
              </button>
            ))
          ) : (
            <p>Successful queries appear here during this session.</p>
          )}
          <small>
            PostgreSQL · PGlite
            <br />
            Runs in a dedicated local worker.
          </small>
        </aside>
        <main className="database-main">
          <label className="database-editor-label" htmlFor={"sql-" + id}>
            SQL editor <span>Cmd/Ctrl+Enter · selection or full script</span>
          </label>
          <textarea
            ref={editor}
            id={"sql-" + id}
            aria-label="SQL editor"
            className="database-editor"
            spellCheck={false}
            value={sql}
            onChange={(e) => {
              latest.current = e.target.value;
              setSQL(e.target.value);
              dirty.current = true;
              useDesktop.getState().setDirty(id, true);
            }}
          />
          <nav className="database-result-tabs">
            {results.map((r, i) => (
              <button
                key={i}
                aria-pressed={i === resultIndex}
                onClick={() => setResultIndex(i)}
              >
                Result {i + 1} ·{" "}
                {r.fields.length
                  ? `${r.totalRows} rows`
                  : `${r.affectedRows || 0} affected`}
              </button>
            ))}
          </nav>
          <div className="database-results">
            {selected?.fields.length ? (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {selected.fields.map((field, i) => (
                      <th key={i}>{field.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.rows.map((row, i) => (
                    <tr key={i}>
                      <th>{i + 1}</th>
                      {row.map((value, j) => (
                        <td
                          key={j}
                          className={value === null ? "database-null" : ""}
                          title={sqlCell(value)}
                        >
                          {sqlCell(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="integration-empty">
                {busy
                  ? "Executing SQL…"
                  : selected
                    ? "Statement completed."
                    : "Explore a CSV. Prototype a schema. Query real PostgreSQL."}
              </div>
            )}
          </div>
        </main>
      </div>
      {error && (
        <div className="integration-error" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            aria-label="Dismiss database error"
          >
            ×
          </button>
        </div>
      )}
      <footer className="integration-status">
        <span>{status}</span>
        <span>
          {elapsed ? `${elapsed} ms · ` : ""}
          {selected && selected.totalRows > 1000
            ? "First 1,000 rows displayed · "
            : ""}
          Checkpoints: Workbench.pglite.tar.gz
        </span>
      </footer>
    </div>
  );
}
