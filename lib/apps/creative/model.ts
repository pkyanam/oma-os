export type Note = {
  id: string;
  title: string;
  body: string;
  updated: number;
  pinned: boolean;
  archived: boolean;
};
export type Notebook = { version: 1; notes: Note[] };
export const welcomeNotebook = (): Notebook => ({
  version: 1,
  notes: [
    {
      id: "welcome",
      title: "Getting started",
      body: "# Notes\n\nWrite Markdown and select Preview to read it.\n\n- [ ] Create a note with the + button\n- [ ] Open a daily page from the calendar button\n- [ ] Export a note as Markdown\n\nNotes save automatically. Export a backup in Settings to keep a copy outside this browser.\n",
      updated: Date.now(),
      pinned: true,
      archived: false,
    },
  ],
});
export function parseNotebook(input: string): Notebook {
  const value: unknown = JSON.parse(input);
  if (
    !value ||
    typeof value !== "object" ||
    !("notes" in value) ||
    !Array.isArray(value.notes) ||
    value.notes.length > 5000
  )
    throw new Error("This is not an oma.os notebook.");
  const ids = new Set<string>();
  const notes = value.notes.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid note.");
    const n = item as Record<string, unknown>;
    if (
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      typeof n.title !== "string" ||
      typeof n.body !== "string" ||
      n.body.length > 2_000_000
    )
      throw new Error("Invalid note.");
    ids.add(n.id);
    return {
      id: n.id,
      title: n.title.slice(0, 250),
      body: n.body,
      updated: typeof n.updated === "number" ? n.updated : 0,
      pinned: n.pinned === true,
      archived: n.archived === true,
    };
  });
  return { version: 1, notes };
}
export type Point = { x: number; y: number };
export type Shape = {
  id: string;
  kind: "rect" | "ellipse" | "arrow" | "pen" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text: string;
  points: Point[];
};
export type Board = { version: 1; title: string; shapes: Shape[] };
export const colors = [
  "#7aa2f7",
  "#9ece6a",
  "#e0af68",
  "#f7768e",
  "#bb9af7",
  "#c0caf5",
];
export const emptyBoard = (): Board => ({
  version: 1,
  title: "Untitled board",
  shapes: [],
});
export function parseBoard(input: string): Board {
  const v = JSON.parse(input) as Record<string, unknown>;
  if (!v || !Array.isArray(v.shapes) || v.shapes.length > 5000)
    throw new Error("This is not an oma.os canvas.");
  const ids = new Set<string>();
  const number = (n: unknown) => {
    if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1000000)
      throw new Error("Invalid canvas coordinates.");
    return n;
  };
  return {
    version: 1,
    title:
      typeof v.title === "string" ? v.title.slice(0, 200) : "Imported board",
    shapes: v.shapes.map((s: Record<string, unknown>) => {
      if (
        !s ||
        typeof s.id !== "string" ||
        ids.has(s.id) ||
        !["rect", "ellipse", "arrow", "pen", "text"].includes(String(s.kind))
      )
        throw new Error("Invalid canvas shape.");
      ids.add(s.id);
      if (!Array.isArray(s.points) || s.points.length > 20000)
        throw new Error("Invalid stroke.");
      return {
        id: s.id,
        kind: s.kind as Shape["kind"],
        x: number(s.x),
        y: number(s.y),
        w: number(s.w),
        h: number(s.h),
        color: colors.includes(String(s.color)) ? String(s.color) : colors[0],
        text: typeof s.text === "string" ? s.text.slice(0, 10000) : "",
        points: s.points.map((p: Point) => ({
          x: number(p.x),
          y: number(p.y),
        })),
      };
    }),
  };
}
export function downloadText(
  name: string,
  content: string,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeFilename = (title: string) =>
  title
    .replace(/[^a-z0-9 _.-]/gi, "")
    .trim()
    .slice(0, 100) || "untitled";
export function boardBounds(board: Board) {
  let left = 0,
    top = 0,
    right = 1200,
    bottom = 800;
  for (const shape of board.shapes) {
    const points =
      shape.kind === "pen"
        ? shape.points.map((point) => ({
            x: shape.x + point.x,
            y: shape.y + point.y,
          }))
        : [
            { x: shape.x, y: shape.y },
            {
              x:
                shape.x +
                (shape.kind === "text" ? shape.text.length * 12 : shape.w),
              y: shape.y + (shape.kind === "text" ? -24 : shape.h),
            },
          ];
    for (const point of points) {
      left = Math.min(left, point.x - 16);
      top = Math.min(top, point.y - 16);
      right = Math.max(right, point.x + 16);
      bottom = Math.max(bottom, point.y + 16);
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function boardSVG(board: Board): string {
  const bounds = boardBounds(board);
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const shapes = board.shapes
    .map((s) => {
      const a = `stroke="${escape(s.color)}" stroke-width="2" fill="none"`;
      if (s.kind === "rect")
        return `<rect x="${Math.min(s.x, s.x + s.w)}" y="${Math.min(s.y, s.y + s.h)}" width="${Math.abs(s.w)}" height="${Math.abs(s.h)}" ${a}/>`;
      if (s.kind === "ellipse")
        return `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${Math.abs(s.w / 2)}" ry="${Math.abs(s.h / 2)}" ${a}/>`;
      if (s.kind === "arrow")
        return `<path d="M${s.x} ${s.y}L${s.x + s.w} ${s.y + s.h}" ${a} marker-end="url(#arrow)"/>`;
      if (s.kind === "pen")
        return `<path d="${s.points.map((p, i) => `${i ? "L" : "M"}${p.x + s.x} ${p.y + s.y}`).join(" ")}" ${a} stroke-linecap="round"/>`;
      return `<text x="${s.x}" y="${s.y}" fill="${escape(s.color)}" font-family="monospace" font-size="20">${escape(s.text)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="context-stroke"/></marker></defs><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#1a1b26"/>${shapes}</svg>`;
}
