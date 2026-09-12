import { parseCSV, serializeCSV } from "@/lib/runtime/csv";
export const DATABASE_PATH = "/home/guest/Documents/Workbench.pglite.tar.gz";
export const SQL_DEMO = `-- Real PostgreSQL, running locally in WebAssembly.
-- Run the whole script with Cmd/Ctrl+Enter.
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  hours NUMERIC NOT NULL,
  value NUMERIC NOT NULL
);
INSERT INTO projects (name,category,hours,value) VALUES
  ('Website refresh','Design',12,960),
  ('Research sprint','Research',8,720),
  ('CLI automation','Engineering',6,780),
  ('Documentation','Writing',5,350),
  ('App prototype','Engineering',16,2080)
ON CONFLICT (name) DO NOTHING;

SELECT category, count(*) AS projects,
       sum(hours) AS hours, sum(value) AS value,
       round(sum(value)/sum(hours),2) AS hourly_value
FROM projects GROUP BY category ORDER BY value DESC;`;
export type SQLResult = {
  fields: { name: string; dataTypeID: number }[];
  rows: unknown[][];
  affectedRows?: number;
  totalRows: number;
};
export function sqlIdentifier(value: string) {
  return '"' + value.replaceAll('"', '""') + '"';
}
export function csvImport(source: string, name: string) {
  const sheet = parseCSV(source),
    seen = new Set<string>();
  const headers = sheet.headers.map((header, i) => {
    const base = (header.trim() || `column_${i + 1}`).slice(0, 50);
    let value = base,
      n = 2;
    while (seen.has(value)) value = base + "_" + n++;
    seen.add(value);
    return value;
  });
  const table =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^\d/, "_$&")
      .slice(0, 50) || "imported_data";
  return { name: table, headers, rows: sheet.rows };
}
export function sqlCell(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export function resultCSV(result: SQLResult) {
  return serializeCSV({
    headers: result.fields.map((f) => f.name),
    rows: result.rows.map((row) =>
      row.map((value) => (value === null ? "" : sqlCell(value))),
    ),
  });
}
