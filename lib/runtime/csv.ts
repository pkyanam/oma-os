export type Sheet = { headers: string[]; rows: string[][] };
export function parseCSV(source: string): Sheet {
  if (source.length > 2_000_000)
    throw new Error("CSV limit is 2 MB. Split the file into smaller tables.");
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const input = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"' && cell === "" && !closed) quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      records.push(row);
      if (records.length > 10001)
        throw new Error("Table limit is 10,000 rows.");
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV field.");
      cell += c;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (cell || row.length || closed) {
    row.push(cell);
    records.push(row);
    if (records.length > 10001) throw new Error("Table limit is 10,000 rows.");
  }
  if (!records.length) return { headers: ["Column 1"], rows: [[""]] };
  const width = Math.max(...records.map((r) => r.length));
  if (width > 100 || records.length > 10001)
    throw new Error("Table limit is 100 columns and 10,000 rows.");
  const headers = Array.from(
    { length: width },
    (_, i) => records[0][i] || `Column ${i + 1}`,
  );
  return {
    headers,
    rows: records
      .slice(1)
      .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")),
  };
}
export function serializeCSV(sheet: Sheet) {
  return [sheet.headers, ...sheet.rows]
    .map((row) =>
      row
        .map((cell) =>
          /[",\n\r]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell,
        )
        .join(","),
    )
    .join("\r\n");
}
export function numericSummary(rows: string[][], column: number) {
  const values = rows
    .map((row) => row[column]?.trim())
    .filter((value) => value !== "")
    .map(Number)
    .filter(Number.isFinite);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    sum,
    mean: values.length ? sum / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}
export const DEMO_CSV =
  "Project,Category,Hours,Value\nWebsite refresh,Design,12,960\nResearch sprint,Research,8,720\nCLI automation,Engineering,6,780\nDocumentation,Writing,5,350\nCustomer interviews,Research,9,810\nApp prototype,Engineering,16,2080";
