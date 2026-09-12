"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Table2,
  Save,
  Download,
  Plus,
  Upload,
  ArrowDownUp,
} from "lucide-react";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import {
  DEMO_CSV,
  parseCSV,
  serializeCSV,
  numericSummary,
  type Sheet,
} from "@/lib/runtime/csv";
import styles from "./Runtime.module.css";
import { saveRuntimeDocument } from "@/lib/runtime/documents";
export default function Data({
  id,
  path,
}: {
  id: string;
  path?: string;
  active?: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet>(() => parseCSV(DEMO_CSV));
  const [filename, setFilename] = useState(
    path || "/home/guest/Documents/data.csv",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{
    column: number;
    ascending: boolean;
  } | null>(null);
  const [column, setColumn] = useState(2);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"table" | "chart">("table");
  const [status, setStatus] = useState(
    "Sample data · edit a cell or import your CSV",
  );
  const [history, setHistory] = useState<Sheet[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const original = useRef<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const fsVersion = useDesktop((s) => s.fsVersion);
  const currentFilename = useRef(filename);
  currentFilename.current = filename;
  const currentSheet = useRef(sheet);
  currentSheet.current = sheet;
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
        setSheet(parseCSV(text));
        setHistory([]);
        setColumn(0);
        setSort(null);
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
        setSheet(parseCSV(text));
        setColumn(0);
        setSort(null);
        setHistory([]);
        original.current = text;
        setFilename(path);
        setStatus("Opened " + path);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "NotFoundError") {
          original.current = undefined;
          setStatus("New document · Save to create " + path);
          useDesktop.getState().setDirty(id, true);
        } else setStatus(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [path, id]);
  const rows = useMemo(() => {
    const list = sheet.rows
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          !query ||
          row.some((cell) => cell.toLowerCase().includes(query.toLowerCase())),
      );
    if (sort)
      list.sort((a, b) => {
        const av = a.row[sort.column] ?? "",
          bv = b.row[sort.column] ?? "";
        const n =
          av.trim() !== "" &&
          bv.trim() !== "" &&
          Number.isFinite(Number(av)) &&
          Number.isFinite(Number(bv))
            ? Number(av) - Number(bv)
            : av.localeCompare(bv, undefined, { numeric: true });
        return sort.ascending ? n : -n;
      });
    return list;
  }, [sheet, query, sort]);
  const summary = useMemo(
    () =>
      numericSummary(
        rows.map((r) => r.row),
        column,
      ),
    [rows, column],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  const currentPage = Math.min(page, pages - 1);
  function change(next: Sheet) {
    setHistory((prev) => [...prev.slice(-19), sheet]);
    setSheet(next);
    useDesktop.getState().setDirty(id, true);
    setStatus("Unsaved changes");
  }
  async function save() {
    if (saving) return;
    setSaving(true);
    const wasDirty = !!useDesktop.getState().dirty[id];
    useDesktop.getState().setDirty(id, true);
    try {
      const text = serializeCSV(sheet);
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
          .setDirty(id, wasDirty || currentSheet.current !== sheet);
        return;
      }
      if (currentFilename.current === filename) original.current = text;
      useDesktop
        .getState()
        .setDirty(
          id,
          currentSheet.current !== sheet ||
            currentFilename.current !== filename,
        );
      useDesktop.getState().refreshFs();
      setStatus("Saved " + target);
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([serializeCSV({ ...sheet, rows: rows.map((r) => r.row) })], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.split("/").pop() || "data.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(
      "Downloaded filtered rows as CSV. Formula-like cells remain plain text here; spreadsheet apps may interpret them.",
    );
  }
  return (
    <section
      className={styles.app}
      aria-label="Data workbench"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className={styles.toolbar}>
        <Table2 size={16} />
        <strong>Data</strong>
        <span className={styles.spacer} />
        <button disabled={saving} onClick={save}>
          <Save size={14} /> Save
        </button>
        <button onClick={download}>
          <Download size={14} /> Export
        </button>
      </div>
      <div className={styles.path}>
        <input
          aria-label="CSV file path"
          value={filename}
          onChange={(e) => {
            setFilename(e.target.value);
            original.current = undefined;
          }}
        />
        <button
          onClick={async () => {
            try {
              if (
                useDesktop.getState().dirty[id] &&
                !confirm("Discard table edits and open this file?")
              )
                return;
              const text = await fs.read(filename);
              setSheet(parseCSV(text));
              original.current = text;
              setHistory([]);
              setColumn(0);
              setPage(0);
              useDesktop.getState().setDirty(id, false);
              setStatus("Opened " + filename);
            } catch (e) {
              setStatus(errorMessage(e));
            }
          }}
        >
          Open
        </button>
      </div>
      <div className={styles.controls}>
        <input
          aria-label="Filter table"
          placeholder="Filter every column…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <button onClick={() => fileInput.current?.click()}>
          <Upload size={14} /> Import
        </button>
        <input
          className={styles.hidden}
          ref={fileInput}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 2_000_000) throw new Error("CSV limit is 2 MB");
              if (
                useDesktop.getState().dirty[id] &&
                !confirm("Replace the current table with this import?")
              )
                return;
              change(parseCSV(await file.text()));
              setFilename("/home/guest/Documents/" + file.name);
              original.current = undefined;
              setColumn(0);
              setPage(0);
              setStatus("Imported " + file.name + " · Save to keep in oma.os");
            } catch (err) {
              setStatus(errorMessage(err));
            } finally {
              e.target.value = "";
            }
          }}
        />
        <button
          disabled={sheet.rows.length >= 10000}
          onClick={() =>
            change({
              ...sheet,
              rows: [...sheet.rows, Array(sheet.headers.length).fill("")],
            })
          }
        >
          <Plus size={14} /> Row
        </button>
        <button
          disabled={sheet.headers.length >= 100}
          onClick={() =>
            change({
              headers: [...sheet.headers, `Column ${sheet.headers.length + 1}`],
              rows: sheet.rows.map((row) => [...row, ""]),
            })
          }
        >
          + Column
        </button>
        <button
          disabled={!history.length}
          onClick={() => {
            setSheet(history[history.length - 1]);
            setHistory(history.slice(0, -1));
            useDesktop.getState().setDirty(id, true);
          }}
        >
          Undo
        </button>
      </div>
      <div className={styles.controls}>
        <button
          aria-pressed={view === "table"}
          onClick={() => setView("table")}
        >
          Table
        </button>
        <button
          aria-pressed={view === "chart"}
          onClick={() => setView("chart")}
        >
          Bar chart
        </button>
        <span className={styles.footnote}>
          Select a numeric column below to chart it.
        </span>
      </div>
      {view === "table" ? (
        <div className={styles.tableArea}>
          <table>
            <thead>
              <tr>
                <th className={styles.rowNumber}>#</th>
                {sheet.headers.map((name, i) => (
                  <th key={i}>
                    <div>
                      <input
                        aria-label={`Column ${i + 1} name`}
                        value={name}
                        onChange={(e) =>
                          change({
                            ...sheet,
                            headers: sheet.headers.map((h, j) =>
                              j === i ? e.target.value : h,
                            ),
                          })
                        }
                      />
                      <button
                        aria-label={`Sort by ${name}`}
                        title={
                          sort?.column === i
                            ? sort.ascending
                              ? "Ascending"
                              : "Descending"
                            : "Sort"
                        }
                        onClick={() => {
                          setSort({
                            column: i,
                            ascending:
                              sort?.column === i ? !sort.ascending : true,
                          });
                          setColumn(i);
                        }}
                      >
                        <ArrowDownUp size={12} />
                        {sort?.column === i ? (sort.ascending ? "↑" : "↓") : ""}
                      </button>
                    </div>
                  </th>
                ))}
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(currentPage * 100, (currentPage + 1) * 100)
                .map(({ row, index }) => (
                  <tr key={index}>
                    <th className={styles.rowNumber}>{index + 1}</th>
                    {row.map((cell, c) => (
                      <td key={c}>
                        <input
                          aria-label={`Row ${index + 1}, ${sheet.headers[c]}`}
                          value={cell}
                          onFocus={() => setColumn(c)}
                          onChange={(e) =>
                            change({
                              ...sheet,
                              rows: sheet.rows.map((r, j) =>
                                j === index
                                  ? r.map((value, k) =>
                                      k === c ? e.target.value : value,
                                    )
                                  : r,
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        aria-label={`Delete row ${index + 1}`}
                        onClick={() =>
                          change({
                            ...sheet,
                            rows: sheet.rows.filter((_, i) => i !== index),
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className={styles.empty}>No rows match this filter.</p>
          )}
        </div>
      ) : (
        <div className={styles.chartArea} aria-label="Column bar chart">
          <div className={styles.paneLabel}>
            {sheet.headers[column]} · first 40 filtered rows
          </div>
          {rows.slice(0, 40).map(({ row, index }) => {
            const value = Number(row[column]);
            const max = Math.max(
              1,
              ...rows
                .slice(0, 40)
                .map((r) => Math.abs(Number(r.row[column])))
                .filter(Number.isFinite),
            );
            return row[column]?.trim() && Number.isFinite(value) ? (
              <div className={styles.chartRow} key={index}>
                <span title={row[0]}>{row[0] || `Row ${index + 1}`}</span>
                <div>
                  <i
                    style={{
                      width: `${(Math.abs(value) / max) * 100}%`,
                      background: value < 0 ? "var(--red)" : "var(--accent)",
                    }}
                  />
                </div>
                <b>{value.toLocaleString()}</b>
              </div>
            ) : null;
          })}
          {summary.count === 0 && (
            <p className={styles.empty}>
              Choose a column containing numbers to see a chart.
            </p>
          )}
        </div>
      )}
      <div className={styles.summary}>
        <label>
          Analyze{" "}
          <select
            aria-label="Summary column"
            value={column}
            onChange={(e) => setColumn(Number(e.target.value))}
          >
            {sheet.headers.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span>{summary.count} numeric</span>
        <span>
          Σ{" "}
          {summary.sum.toLocaleString(undefined, { maximumFractionDigits: 3 })}
        </span>
        <span>
          Mean{" "}
          {summary.mean?.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          }) ?? "—"}
        </span>
        <span>Min {summary.min ?? "—"}</span>
        <span>Max {summary.max ?? "—"}</span>
      </div>
      <div className={styles.controls}>
        <span>
          {rows.length.toLocaleString()} / {sheet.rows.length.toLocaleString()}{" "}
          rows · {sheet.headers.length} columns
        </span>
        <span className={styles.spacer} />
        <button
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          {currentPage + 1} / {pages}
        </span>
        <button
          disabled={currentPage >= pages - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
      <div className={styles.status} role="status">
        {status}
      </div>
      <div className={styles.footnote}>
        Local CSV workspace · quoted fields supported · 10,000 rows / 100
        columns · formulas are text, never executed.
      </div>
    </section>
  );
}
