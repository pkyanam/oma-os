/* PGlite runs only in this dedicated worker. No remote database or API key. */
import { PGlite } from "/pglite/index.js";
import { loadPGliteBundle } from "/workers/pglite-bundle.js";
let db;
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
self.onmessage = async ({ data }) => {
  const { id, kind } = data;
  try {
    if (kind === "init") {
      const fsBundle = await loadPGliteBundle();
      db = await PGlite.create({
        ...(fsBundle ? { fsBundle } : {}),
        dataDir: "memory://",
        ...(data.snapshot ? { loadDataDir: data.snapshot } : {}),
      });
      await db.exec("SET statement_timeout = '20s'");
      self.postMessage({ id, ok: true });
      return;
    }
    if (!db) throw new Error("Database is not ready.");
    let results = [];
    let error = "";
    try {
      if (kind === "query")
        results = await db.exec(data.sql, { rowMode: "array" });
      else if (kind === "import") {
        if (db.isInTransaction())
          throw new Error(
            "Commit or roll back the open transaction before importing CSV.",
          );
        const { name, headers, rows } = data;
        if (
          typeof name !== "string" ||
          !name ||
          name.length > 63 ||
          !Array.isArray(headers) ||
          headers.length > 100 ||
          !Array.isArray(rows) ||
          rows.length > 10000
        )
          throw new Error("Invalid CSV import.");
        await db.transaction(async (tx) => {
          await tx.exec(
            `CREATE TABLE ${quote(name)} (${headers.map((h) => quote(h) + " TEXT").join(",")})`,
          );
          const placeholders = headers.map((_, i) => "$" + (i + 1)).join(",");
          for (const row of rows)
            await tx.query(
              `INSERT INTO ${quote(name)} VALUES (${placeholders})`,
              row,
            );
        });
        results = await db.exec(`SELECT * FROM ${quote(name)} LIMIT 1000`, {
          rowMode: "array",
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (db.isInTransaction()) {
      self.postMessage({
        id,
        ok: true,
        error,
        inTransaction: true,
        results: results.map((r) => ({
          ...r,
          totalRows: r.rows.length,
          rows: r.rows.slice(0, 1000),
        })),
      });
      return;
    }
    const tables = (
      await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      )
    ).rows.map((r) => r.table_name);
    // Checkpoint after every operation, including a failed multi-statement script.
    const snapshot = await db.dumpDataDir("gzip");
    self.postMessage({
      id,
      ok: true,
      error,
      inTransaction: false,
      tables,
      snapshot,
      results: results.map((r) => ({
        ...r,
        totalRows: r.rows.length,
        rows: r.rows.slice(0, 1000),
      })),
    });
  } catch (e) {
    self.postMessage({
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
