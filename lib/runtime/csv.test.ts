import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, serializeCSV, numericSummary } from "./csv";
test("CSV preserves quoted commas, multiline cells and escaped quotes", () => {
  const sheet = parseCSV(
    'name,note\r\nAda,"hello, world"\r\nGrace,"two\nlines and ""quotes"""',
  );
  assert.equal(sheet.rows[1][1], 'two\nlines and "quotes"');
  assert.deepEqual(parseCSV(serializeCSV(sheet)), sheet);
});
test("CSV handles BOM, ragged rows and final empty cell", () => {
  assert.deepEqual(parseCSV("\uFEFFa,b\n1,\n2,3,4"), {
    headers: ["a", "b", "Column 3"],
    rows: [
      ["1", "", ""],
      ["2", "3", "4"],
    ],
  });
});
test("CSV rejects malformed quoted input and oversized dimensions", () => {
  assert.throws(() => parseCSV('a\n"unfinished'), /Unclosed/);
  assert.throws(() => parseCSV('a\n"x"wrong'), /Unexpected/);
  assert.throws(() => parseCSV(Array(102).fill("x").join(",")), /limit/);
});
test("numeric summary excludes missing and nonnumeric cells but includes zero", () => {
  assert.deepEqual(numericSummary([["2"], [""], ["x"], ["0"], ["4"]], 0), {
    count: 3,
    sum: 6,
    mean: 2,
    min: 0,
    max: 4,
  });
});
test("CSV bounds record counts before large spread operations", () => {
  assert.throws(() => parseCSV("a\n" + "x\n".repeat(10002)), /limit/);
});
test("CSV treats formula-looking strings as inert text", () => {
  const sheet = parseCSV("value\n=1+1\n@SUM(A1:A2)");
  assert.equal(sheet.rows[0][0], "=1+1");
  assert.equal(parseCSV(serializeCSV(sheet)).rows[1][0], "@SUM(A1:A2)");
});
