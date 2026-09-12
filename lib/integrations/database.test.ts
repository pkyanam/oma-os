import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { csvImport, resultCSV, SQL_DEMO, sqlIdentifier } from "./database";
import { newDrawing, parseDrawing } from "./draw";
test("drawing format remains interoperable and rejects malformed scenes", () => {
  const scene = newDrawing();
  assert.deepEqual(parseDrawing(JSON.stringify(scene)).elements, []);
  assert.throws(() => parseDrawing('{"type":"excalidraw","elements":{}}'));
  assert.throws(() => parseDrawing('{"type":"other","elements":[]}'));
  assert.throws(() =>
    parseDrawing('{"type":"excalidraw","elements":[],"files":[]}'),
  );
});
test("CSV import preserves values, makes unique headers and quotes identifiers", () => {
  const data = csvImport(
    'Name,Name,Cost\n"A,B",second,12\n',
    "2026 projects.csv",
  );
  assert.deepEqual(data.headers, ["Name", "Name_2", "Cost"]);
  assert.deepEqual(data.rows, [["A,B", "second", "12"]]);
  assert.equal(data.name, "_2026_projects");
  assert.equal(sqlIdentifier('a"; DROP TABLE x;--'), '"a""; DROP TABLE x;--"');
  assert.equal(
    resultCSV({
      fields: [{ name: "name", dataTypeID: 25 }],
      rows: [["a,b"], [null]],
      totalRows: 2,
    }),
    'name\r\n"a,b"\r\n',
  );
});
test("real PGlite executes the demo, imports safely, and restores a checkpoint", async () => {
  const db = await PGlite.create();
  let restored: PGlite | undefined;
  try {
    const results = await db.exec(SQL_DEMO);
    assert.equal(results.at(-1)?.rows.length, 4);
    const data = csvImport(
      'Name,Value\n"Alice; DROP TABLE projects",12',
      "safe.csv",
    );
    await db.exec(
      `CREATE TABLE ${sqlIdentifier(data.name)} (${data.headers.map((h) => sqlIdentifier(h) + " TEXT").join(",")})`,
    );
    await db.query(
      `INSERT INTO ${sqlIdentifier(data.name)} VALUES ($1,$2)`,
      data.rows[0],
    );
    const snapshot = await db.dumpDataDir("gzip");
    restored = await PGlite.create({ loadDataDir: snapshot });
    const count = await restored.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM projects",
    );
    assert.equal(count.rows[0].count, 5);
    const imported = await restored.query<{ Name: string }>(
      'SELECT "Name" FROM safe',
    );
    assert.equal(imported.rows[0].Name, "Alice; DROP TABLE projects");
  } finally {
    await restored?.close();
    await db.close();
  }
});

test("malformed drawing elements and remote image references fail before replacing a scene", () => {
  const scene = newDrawing();
  for (const elements of [
    [null],
    [{ id: "bad", type: "rectangle", x: "not a coordinate" }],
    [{ id: "bad", type: "line", points: [null] }],
    [{ id: "bad", type: "text", text: 42 }],
  ])
    assert.throws(() => parseDrawing(JSON.stringify({ ...scene, elements })));
  assert.throws(() =>
    parseDrawing(
      JSON.stringify({
        ...scene,
        files: {
          remote: { id: "remote", dataURL: "https://example.com/image.png" },
        },
      }),
    ),
  );
  assert.throws(() => parseDrawing(JSON.stringify({ ...scene, appState: [] })));
  assert.throws(() => parseDrawing(" ".repeat(25_000_001)));
});
