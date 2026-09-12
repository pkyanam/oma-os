"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Save,
  FileInput,
  Download,
  FlaskConical,
} from "lucide-react";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import styles from "./Runtime.module.css";
import { saveRuntimeDocument } from "@/lib/runtime/documents";
const EXAMPLES: Record<string, string> = {
  "Data analysis": `import csv, statistics\nfrom io import StringIO\n\ndata = """day,visitors\nMon,124\nTue,182\nWed,156\nThu,219\nFri,287\n"""\nrows = list(csv.DictReader(StringIO(data)))\nvalues = [int(row["visitors"]) for row in rows]\nprint(f"Total visitors: {sum(values):,}")\nprint(f"Daily average: {statistics.mean(values):.1f}")\nprint("\\nTraffic by day")\nfor row in rows:\n    print(f"{row['day']} {'▇' * (int(row['visitors']) // 10)} {row['visitors']}")\nwith open("report.csv", "w") as file:\n    file.write(data)\nprint("\\nCreated report.csv — export it to your desktop files.")`,
  "SQLite in Python": `import sqlite3\n\ndb = sqlite3.connect(":memory:")\ndb.execute("CREATE TABLE projects (name TEXT, hours REAL, rate REAL)")\ndb.executemany("INSERT INTO projects VALUES (?, ?, ?)", [\n    ("Prototype", 16, 130), ("Research", 8, 90), ("Writing", 5, 70)\n])\nfor name, revenue in db.execute("SELECT name, hours * rate AS revenue FROM projects ORDER BY revenue DESC"):\n    print(f"{name:12} {revenue:8.2f}")\nprint("Total:", db.execute("SELECT SUM(hours * rate) FROM projects").fetchone()[0])`,
  "Generative SVG": `import math\n\npaths = []\nfor i in range(160):\n    angle = i * 2.399963229728653\n    radius = 10 * math.sqrt(i)\n    x, y = 180 + radius * math.cos(angle), 180 + radius * math.sin(angle)\n    paths.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4" fill="#7aa2f7"/>')\nsvg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><rect width="360" height="360" fill="#1a1b26"/>' + ''.join(paths) + '</svg>'\nwith open("phyllotaxis.svg", "w") as file:\n    file.write(svg)\nprint("Created phyllotaxis.svg: a sunflower spiral from the golden angle.")`,
  "Import a CSV": `import csv, statistics\nfrom pathlib import Path\n\nfiles = list(Path("/work").glob("*.csv"))\nif not files:\n    print("Use Import file to copy a CSV from oma.os into /work first.")\nelse:\n    with files[0].open() as file:\n        rows = list(csv.DictReader(file))\n    print(f"{files[0].name}: {len(rows)} rows")\n    for key in rows[0] if rows else []:\n        try:\n            values = [float(row[key]) for row in rows if row[key].strip()]\n            if values:\n                print(f"{key}: sum={sum(values):.2f}, mean={statistics.mean(values):.2f}")\n        except ValueError:\n            print(f"{key}: {len(set(row[key] for row in rows))} unique values")`,
};
export default function Lab({
  id,
  path,
}: {
  id: string;
  path?: string;
  active?: boolean;
}) {
  const [code, setCode] = useState(EXAMPLES["Data analysis"]);
  const [filename, setFilename] = useState(
    path || "/home/guest/Projects/lab.py",
  );
  const [status, setStatus] = useState("Ready — Python loads on first run");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [imports, setImports] = useState<{ name: string; content: string }[]>(
    [],
  );
  const [importPath, setImportPath] = useState(
    "/home/guest/Documents/data.csv",
  );
  const [showImport, setShowImport] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const original = useRef<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const operation = useRef(0);
  const mounted = useRef(true);
  const activeRun = useRef(false);
  const activeSave = useRef(false);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsVersion = useDesktop((s) => s.fsVersion);
  const currentFilename = useRef(filename);
  currentFilename.current = filename;
  const currentCode = useRef(code);
  currentCode.current = code;
  const dirty = (value: boolean) => useDesktop.getState().setDirty(id, value);
  useEffect(() => {
    if (
      original.current === undefined ||
      useDesktop.getState().dirty[id] ||
      saving
    )
      return;
    let cancelled = false;
    const baseline = original.current;
    fs.read(filename)
      .then((text) => {
        if (
          cancelled ||
          useDesktop.getState().dirty[id] ||
          currentFilename.current !== filename ||
          text === baseline
        )
          return;
        setCode(text);
        original.current = text;
        setStatus("Reloaded external changes from " + filename);
      })
      .catch((e) => {
        if (!cancelled) setStatus(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fsVersion, filename, id, saving]);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    fs.read(path)
      .then((text) => {
        if (cancelled || useDesktop.getState().dirty[id]) return;
        setCode(text);
        original.current = text;
        setFilename(path);
        setStatus("Opened " + path);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "NotFoundError") {
          original.current = undefined;
          setStatus("New document · Save to create " + path);
          useDesktop
            .getState()
            .setDirty(id, currentCode.current !== EXAMPLES["Data analysis"]);
        } else setStatus(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [path, id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current++;
      worker.current?.terminate();
      if (exportTimer.current) clearTimeout(exportTimer.current);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const stop = (
    message = "Stopped. Python memory reset; source preserved.",
  ) => {
    operation.current++;
    activeRun.current = false;
    worker.current?.terminate();
    worker.current = null;
    if (exportTimer.current) clearTimeout(exportTimer.current);
    setExporting(false);
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setFiles([]);
    setStatus(message);
  };
  async function save() {
    if (activeSave.current) return;
    activeSave.current = true;
    setSaving(true);
    const wasDirty = !!useDesktop.getState().dirty[id];
    useDesktop.getState().setDirty(id, true);
    try {
      const text = code;
      const target = await saveRuntimeDocument({
        path: filename,
        content: text,
        expected: original.current,
        confirmReplace: (target) =>
          confirm("Replace " + target + " with this document?"),
      });
      if (!target) {
        useDesktop
          .getState()
          .setDirty(id, wasDirty || currentCode.current !== code);
        return;
      }
      if (currentFilename.current === filename) original.current = text;
      useDesktop
        .getState()
        .setDirty(
          id,
          currentCode.current !== code || currentFilename.current !== filename,
        );
      useDesktop.getState().refreshFs();
      setStatus("Saved " + target);
    } catch (e) {
      if (mounted.current) {
        dirty(
          wasDirty ||
            currentCode.current !== code ||
            currentFilename.current !== filename,
        );
        setStatus(errorMessage(e));
      }
    } finally {
      activeSave.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function run() {
    if (activeRun.current || exporting) return;
    activeRun.current = true;
    setOutput("");
    setBusy(true);
    setStatus("Starting Python…");
    try {
      if (!worker.current) {
        worker.current = new Worker("/runtime/python-worker.mjs", {
          type: "module",
        });
        const instance = worker.current;
        worker.current.onmessageerror = () =>
          stop("Python returned unreadable data. Run again to restart it.");
        worker.current.onerror = (e) => {
          setOutput((prev) => prev + "\n" + e.message);
          stop("Runtime failed. Check network and try Run again.");
        };
        worker.current.onmessage = async ({ data }) => {
          if (worker.current !== instance || !mounted.current) return;
          if (data.type === "status") setStatus(data.text);
          else if (data.type === "stdout" || data.type === "stderr")
            setOutput((prev) => (prev + data.text + "\n").slice(-100000));
          else if (data.type === "done" || data.type === "error") {
            if (timer.current) clearTimeout(timer.current);
            activeRun.current = false;
            setBusy(false);
            if (data.type === "error") {
              setOutput((prev) => prev + "\n" + data.text);
              setStatus("Python error — edit and run again");
            } else {
              setStatus(
                `Finished in ${(data.elapsed / 1000).toFixed(2)}s · variables kept until Stop or close`,
              );
              setFiles(data.files);
            }
          } else if (data.type === "file" || data.type === "read-error") {
            if (exportTimer.current) clearTimeout(exportTimer.current);
            const generation = operation.current;
            try {
              if (data.type === "read-error") throw new Error(data.text);
              const target = "/home/guest/Documents/" + data.name;
              const exported = await saveRuntimeDocument({
                path: target,
                content: data.content,
                confirmReplace: () => false,
              });
              if (!exported) {
                setStatus(
                  "Export would replace " +
                    target +
                    ". Rename or remove it in Files first.",
                );
                return;
              }
              useDesktop.getState().refreshFs();
              if (generation === operation.current && mounted.current)
                setStatus("Exported " + target);
            } catch (e) {
              if (generation === operation.current && mounted.current)
                setStatus(errorMessage(e));
            } finally {
              if (generation === operation.current && mounted.current)
                setExporting(false);
            }
          }
        };
      }
      timer.current = setTimeout(
        () =>
          stop(
            "Stopped after 120 seconds. Source preserved; Python memory reset.",
          ),
        120000,
      );
      worker.current.postMessage({ type: "run", code, files: imports });
      setImports([]);
    } catch (error) {
      stop("Python could not start: " + errorMessage(error));
    }
  }
  async function reload() {
    if (
      useDesktop.getState().dirty[id] &&
      !confirm("Discard source changes and reload from disk?")
    )
      return;
    try {
      const text = await fs.read(filename);
      setCode(text);
      original.current = text;
      dirty(false);
      setStatus("Reloaded " + filename);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }
  function requestClose() {
    useDesktop.getState().closeTile(id);
  }
  function exportFile(name: string) {
    if (activeRun.current || exporting || !worker.current) return;
    setExporting(true);
    setStatus("Exporting " + name + "…");
    exportTimer.current = setTimeout(() => {
      setExporting(false);
      setStatus(
        "Export timed out. Stop Python and run again to reset the worker.",
      );
    }, 10000);
    try {
      worker.current.postMessage({ type: "read", name });
    } catch (error) {
      if (exportTimer.current) clearTimeout(exportTimer.current);
      setExporting(false);
      setStatus(errorMessage(error));
    }
  }
  return (
    <section
      className={styles.app}
      aria-label="Python Lab"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className={styles.toolbar}>
        <FlaskConical size={16} />
        <strong>Python Lab</strong>
        <span className={styles.spacer} />
        <button disabled={saving} onClick={save} title="Save source">
          <Save size={14} /> Save
        </button>
        <button onClick={requestClose}>Close</button>
        {busy || exporting ? (
          <button onClick={() => stop()}>
            <Square size={14} /> Stop
          </button>
        ) : (
          <button onClick={run}>
            <Play size={14} /> Run
          </button>
        )}
      </div>
      <div className={styles.controls}>
        <button disabled={saving} onClick={reload}>
          Reload source
        </button>
        <select
          aria-label="Python example"
          defaultValue="Data analysis"
          disabled={busy}
          onChange={(e) => {
            if (
              code !== EXAMPLES["Data analysis"] &&
              !confirm(
                "Replace the current source with this example? Save it first to keep your changes.",
              )
            )
              return;
            setCode(EXAMPLES[e.target.value]);
            dirty(true);
          }}
        >
          {Object.keys(EXAMPLES).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button onClick={() => setShowImport(!showImport)}>
          <FileInput size={14} /> Import file
        </button>
      </div>
      <div className={styles.path}>
        <input
          aria-label="Python source path"
          value={filename}
          onChange={(e) => {
            setFilename(e.target.value);
            original.current = undefined;
          }}
        />
      </div>
      {showImport && (
        <form
          className={styles.controls}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const content = await fs.read(importPath);
              if (content.length > 1000000)
                throw new Error("Import limit is 1 MB");
              setImports((prev) => [
                ...prev.filter((f) => f.name !== importPath.split("/").pop()),
                { name: importPath.split("/").pop()!, content },
              ]);
              setStatus("Queued import into /work for next Run");
              setShowImport(false);
            } catch (err) {
              setStatus(errorMessage(err));
            }
          }}
        >
          <input
            aria-label="Import desktop file path"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
          />
          <button>Import</button>
        </form>
      )}
      <div className={styles.labBody}>
        <div className={styles.codePane}>
          <div className={styles.paneLabel}>
            SOURCE <span>Shift+Enter to run</span>
          </div>
          <textarea
            aria-label="Python source"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              dirty(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                if (!busy) run();
              }
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget;
                const start = t.selectionStart;
                setCode(
                  code.slice(0, start) + "    " + code.slice(t.selectionEnd),
                );
                dirty(true);
                requestAnimationFrame(() => {
                  t.selectionStart = t.selectionEnd = start + 4;
                });
              }
            }}
          />
        </div>
        <div className={styles.outputPane}>
          <div className={styles.paneLabel}>
            OUTPUT <button onClick={() => setOutput("")}>Clear</button>
          </div>
          <pre aria-label="Python output" role="log">
            {output ||
              "Run Python in a dedicated worker. Your desktop stays responsive."}
          </pre>
          {files.length > 0 && (
            <div className={styles.artifacts}>
              <span>FILES IN /work · text export to Documents</span>
              {files.map((file) => (
                <button
                  disabled={busy || exporting}
                  key={file.name}
                  onClick={() => exportFile(file.name)}
                >
                  <Download size={13} />
                  {file.name}
                  <small>{file.size} B</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.status} role="status">
        {status}
      </div>
      <div className={styles.footnote}>
        Python/WASM · runtime downloads on first run through this app’s cached
        asset service. Run trusted code only: worker code can use browser
        networking. Stop resets memory.{" "}
        {imports.length > 0 ? `${imports.length} file(s) queued.` : ""}
      </div>
    </section>
  );
}
