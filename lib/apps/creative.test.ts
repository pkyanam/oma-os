import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBoard,
  parseNotebook,
  boardSVG,
  welcomeNotebook,
  emptyBoard,
  safeFilename,
} from "./creative/model";
test("notebook round trips ordinary text, preserves archives and rejects duplicate IDs", () => {
  const book = welcomeNotebook();
  book.notes[0].archived = true;
  book.notes[0].body = "<script>alert(1)</script>\n[ ] task";
  assert.deepEqual(parseNotebook(JSON.stringify(book)), book);
  assert.throws(
    () =>
      parseNotebook(
        JSON.stringify({ ...book, notes: [...book.notes, ...book.notes] }),
      ),
    /Invalid note/,
  );
});
test("notebook rejects malformed or oversized content instead of replacing it", () => {
  assert.throws(() => parseNotebook("{}"));
  assert.throws(() =>
    parseNotebook(
      JSON.stringify({
        notes: [{ id: "1", title: "x", body: "x".repeat(2_000_001) }],
      }),
    ),
  );
});
test("canvas schema rejects executable shape kinds, invalid numbers, duplicate IDs and overlong strokes", () => {
  const shape = {
    id: "a",
    kind: "rect",
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    color: "#7aa2f7",
    text: "",
    points: [],
  };
  const board = { ...emptyBoard(), shapes: [shape] };
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  for (const patch of [
    { kind: "script" },
    { x: null },
    { x: 1000001 },
    { points: Array(20001).fill({ x: 0, y: 0 }) },
  ])
    assert.throws(() =>
      parseBoard(
        JSON.stringify({ ...board, shapes: [{ ...shape, ...patch }] }),
      ),
    );
  assert.throws(() =>
    parseBoard(JSON.stringify({ ...board, shapes: [shape, shape] })),
  );
});
test("SVG export escapes user text and makes negative rectangles valid", () => {
  const board = parseBoard(
    JSON.stringify({
      title: "x",
      shapes: [
        {
          id: "a",
          kind: "text",
          x: 10,
          y: 20,
          w: 0,
          h: 0,
          color: "#7aa2f7",
          text: '<script>&"',
          points: [],
        },
        {
          id: "b",
          kind: "rect",
          x: 100,
          y: 100,
          w: -60,
          h: -30,
          color: "#9ece6a",
          text: "",
          points: [],
        },
      ],
    }),
  );
  const svg = boardSVG(board);
  assert.ok(svg.includes("&lt;script&gt;&amp;&quot;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes('x="40" y="70" width="60" height="30"'));
});
test("export filenames cannot create path components", () => {
  assert.equal(safeFilename("../../my<note>"), "....mynote");
  assert.equal(safeFilename("♥"), "untitled");
});
test("SVG export includes drawing outside the initial artboard", () => {
  const board = parseBoard(
    JSON.stringify({
      title: "wide",
      shapes: [
        {
          id: "a",
          kind: "rect",
          x: -500,
          y: 900,
          w: 200,
          h: 200,
          color: "#7aa2f7",
          text: "",
          points: [],
        },
      ],
    }),
  );
  assert.ok(boardSVG(board).includes('viewBox="-516 0 1716 1116"'));
});
