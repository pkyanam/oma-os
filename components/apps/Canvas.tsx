"use client";
import { useRef, useState, type PointerEvent } from "react";
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  ArrowUpRight,
  Pencil,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Upload,
  ZoomIn,
  Copy,
  BringToFront,
  SendToBack,
  ZoomOut,
  Maximize,
} from "lucide-react";
import { useDocument } from "@/lib/apps/creative/useDocument";
import {
  emptyBoard,
  parseBoard,
  colors,
  boardSVG,
  boardBounds,
  downloadText,
  safeFilename,
  type Shape,
  type Point,
  type Board,
} from "@/lib/apps/creative/model";
import "./creative.css";
type Tool = Shape["kind"] | "select" | "pan";
const tools: { id: Tool; label: string; key: string; icon: typeof Square }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "pan", label: "Pan", key: "H", icon: Hand },
  { id: "rect", label: "Rectangle", key: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", key: "O", icon: Circle },
  { id: "arrow", label: "Arrow", key: "A", icon: ArrowUpRight },
  { id: "pen", label: "Draw", key: "P", icon: Pencil },
  { id: "text", label: "Text", key: "T", icon: Type },
];
function ShapeView({ s, selected = false }: { s: Shape; selected?: boolean }) {
  const common = {
    stroke: s.color,
    strokeWidth: selected ? 3 : 2,
    fill: "transparent",
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (s.kind === "rect")
    return (
      <rect
        x={Math.min(s.x, s.x + s.w)}
        y={Math.min(s.y, s.y + s.h)}
        width={Math.abs(s.w)}
        height={Math.abs(s.h)}
        {...common}
      />
    );
  if (s.kind === "ellipse")
    return (
      <ellipse
        cx={s.x + s.w / 2}
        cy={s.y + s.h / 2}
        rx={Math.abs(s.w / 2)}
        ry={Math.abs(s.h / 2)}
        {...common}
      />
    );
  if (s.kind === "arrow") {
    const end = { x: s.x + s.w, y: s.y + s.h },
      angle = Math.atan2(s.h, s.w),
      size = 12;
    return (
      <g>
        <path d={`M${s.x},${s.y}L${end.x},${end.y}`} {...common} />
        <path
          d={`M${end.x - size * Math.cos(angle - 0.5)},${end.y - size * Math.sin(angle - 0.5)}L${end.x},${end.y}L${end.x - size * Math.cos(angle + 0.5)},${end.y - size * Math.sin(angle + 0.5)}`}
          {...common}
        />
      </g>
    );
  }
  if (s.kind === "pen")
    return (
      <path
        d={s.points
          .map((p, i) => `${i ? "L" : "M"}${p.x + s.x},${p.y + s.y}`)
          .join(" ")}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...common}
      />
    );
  return (
    <text
      x={s.x}
      y={s.y}
      fill={s.color}
      fontSize={20}
      fontFamily="var(--font-mono)"
    >
      {s.text}
    </text>
  );
}
export default function Canvas({
  id,
  active,
  path = "/home/guest/Documents/Canvas.oma-canvas.json",
}: {
  id: string;
  active: boolean;
  path?: string;
}) {
  const doc = useDocument(id, path, emptyBoard, parseBoard);
  const [tool, setTool] = useState<Tool>("select"),
    [color, setColor] = useState(colors[0]),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Shape | null>(null),
    [text, setText] = useState("Your idea"),
    [view, setView] = useState({ x: 0, y: 0, w: 1200, h: 800 }),
    [error, setError] = useState(""),
    [exportMenu, setExportMenu] = useState(false);
  const [history, setHistory] = useState<Board[]>([]),
    [future, setFuture] = useState<Board[]>([]);
  const svg = useRef<SVGSVGElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const drag = useRef<{
    start: Point;
    shape: Shape | null;
    view: typeof view;
    pointer: number;
    pan: boolean;
  } | null>(null);
  const selectedShape = doc.value.shapes.find((s) => s.id === selected);
  const commit = (board: Board) => {
    if (board.shapes.length > 5000) {
      setError(
        "This board has reached its 5,000 object limit. Export it and start another board.",
      );
      return;
    }
    setHistory((h) => [...h.slice(-49), doc.value]);
    setFuture([]);
    doc.update(board);
  };
  const undo = () => {
    const previous = history.at(-1);
    if (previous) {
      setFuture((f) => [doc.value, ...f]);
      setHistory((h) => h.slice(0, -1));
      doc.update(previous);
      setSelected(null);
    }
  };
  const redo = () => {
    const next = future[0];
    if (next) {
      setHistory((h) => [...h, doc.value]);
      setFuture((f) => f.slice(1));
      doc.update(next);
      setSelected(null);
    }
  };
  const point = (e: PointerEvent<SVGSVGElement>): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!doc.ready || drag.current || e.button > 1) return;
    e.preventDefault();
    e.currentTarget.focus();
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "pan" || e.button === 1) {
      drag.current = {
        start: p,
        shape: null,
        view,
        pointer: e.pointerId,
        pan: true,
      };
      return;
    }
    if (tool === "select") {
      const hit =
        (e.target as Element)
          .closest("[data-shape]")
          ?.getAttribute("data-shape") ?? null;
      setSelected(hit);
      const s = doc.value.shapes.find((s) => s.id === hit);
      if (s) setColor(s.color);
      if (s)
        drag.current = {
          start: p,
          shape: s,
          view,
          pointer: e.pointerId,
          pan: false,
        };
      return;
    }
    const s: Shape = {
      id: crypto.randomUUID(),
      kind: tool,
      x: p.x,
      y: p.y,
      w: 0,
      h: 0,
      color,
      text,
      points: [{ x: 0, y: 0 }],
    };
    if (tool === "text") {
      commit({ ...doc.value, shapes: [...doc.value.shapes, s] });
      setSelected(s.id);
      setTool("select");
      return;
    }
    drag.current = {
      start: p,
      shape: s,
      view,
      pointer: e.pointerId,
      pan: false,
    };
    setDraft(s);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = point(e),
      dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (d.pan) {
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      return;
    }
    if (!d.shape) return;
    if (tool === "select") {
      setDraft({ ...d.shape, x: d.shape.x + dx, y: d.shape.y + dy });
      return;
    }
    if (d.shape.kind === "pen") {
      setDraft((old) =>
        old && old.points.length < 20000
          ? { ...old, points: [...old.points, { x: dx, y: dy }] }
          : old,
      );
      return;
    }
    setDraft({
      ...d.shape,
      w: e.shiftKey ? Math.sign(dx) * Math.max(Math.abs(dx), Math.abs(dy)) : dx,
      h: e.shiftKey ? Math.sign(dy) * Math.max(Math.abs(dx), Math.abs(dy)) : dy,
    });
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointer !== e.pointerId) return;
    if (draft) {
      const exists = doc.value.shapes.some((s) => s.id === draft.id);
      if (
        exists ||
        draft.kind === "pen" ||
        Math.abs(draft.w) + Math.abs(draft.h) > 3
      ) {
        commit({
          ...doc.value,
          shapes: exists
            ? doc.value.shapes.map((s) => (s.id === draft.id ? draft : s))
            : [...doc.value.shapes, draft],
        });
        setSelected(draft.id);
      }
    }
    setDraft(null);
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const zoom = (factor: number) =>
    setView((v) => {
      const w = Math.max(240, Math.min(6000, v.w * factor)),
        h = (w * 2) / 3;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  const remove = () => {
    if (selected) {
      commit({
        ...doc.value,
        shapes: doc.value.shapes.filter((s) => s.id !== selected),
      });
      setSelected(null);
    }
  };
  const png = async () => {
    try {
      const url = URL.createObjectURL(
        new Blob([boardSVG(doc.value)], { type: "image/svg+xml" }),
      );
      const img = new Image();
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Could not render image"));
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        const bounds = boardBounds(doc.value);
        const scale = 2400 / Math.max(bounds.width, bounds.height);
        canvas.width = Math.max(1, Math.round(bounds.width * scale));
        canvas.height = Math.max(1, Math.round(bounds.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image export unavailable");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const output = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = output;
          a.download = safeFilename(doc.value.title) + ".png";
          a.click();
          setTimeout(() => URL.revokeObjectURL(output), 1000);
        }, "image/png");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div
      className="creative-app canvas-app"
      onKeyDown={(e) => {
        if (
          !active ||
          (e.target instanceof HTMLElement &&
            ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))
        )
          return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          void doc.flush();
          return;
        }
        if (e.altKey || e.metaKey || e.ctrlKey) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          remove();
        }
        if (e.key === "Escape") {
          setSelected(null);
          setDraft(null);
          drag.current = null;
          setTool("select");
        }
        const match = tools.find(
          (t) => t.key.toLowerCase() === e.key.toLowerCase(),
        );
        if (match) setTool(match.id);
        if (selectedShape && e.key.startsWith("Arrow")) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          commit({
            ...doc.value,
            shapes: doc.value.shapes.map((s) =>
              s.id === selected
                ? {
                    ...s,
                    x:
                      s.x +
                      (e.key === "ArrowRight"
                        ? step
                        : e.key === "ArrowLeft"
                          ? -step
                          : 0),
                    y:
                      s.y +
                      (e.key === "ArrowDown"
                        ? step
                        : e.key === "ArrowUp"
                          ? -step
                          : 0),
                  }
                : s,
            ),
          });
        }
      }}
    >
      <header className="creative-toolbar">
        <input
          className="canvas-title"
          aria-label="Board title"
          value={doc.value.title}
          disabled={!doc.ready}
          maxLength={200}
          onChange={(e) => doc.update({ ...doc.value, title: e.target.value })}
        />
        <button aria-label="Undo" disabled={!history.length} onClick={undo}>
          <Undo2 size={15} />
        </button>
        <button aria-label="Redo" disabled={!future.length} onClick={redo}>
          <Redo2 size={15} />
        </button>
        <button
          aria-label="Import canvas"
          disabled={!doc.ready}
          onClick={() => upload.current?.click()}
        >
          <Upload size={15} />
        </button>
        <button
          aria-label="Export canvas"
          aria-expanded={exportMenu}
          onClick={() => setExportMenu(!exportMenu)}
        >
          <Download size={15} />
        </button>
      </header>
      {exportMenu && (
        <div className="canvas-export">
          <span>Export board</span>
          <button
            onClick={() =>
              downloadText(
                safeFilename(doc.value.title) + ".oma-canvas.json",
                JSON.stringify(doc.value, null, 2),
                "application/json",
              )
            }
          >
            Editable JSON
          </button>
          <button
            onClick={() =>
              downloadText(
                safeFilename(doc.value.title) + ".svg",
                boardSVG(doc.value),
                "image/svg+xml",
              )
            }
          >
            SVG
          </button>
          <button onClick={() => void png()}>PNG (2400px)</button>
        </div>
      )}
      <input
        type="file"
        hidden
        ref={upload}
        accept=".json,application/json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            if (f.size > 5_000_000)
              throw new Error("Canvas files must be smaller than 5 MB.");
            const next = parseBoard(await f.text());
            commit({
              ...doc.value,
              shapes: [
                ...doc.value.shapes,
                ...next.shapes.map((s) => ({ ...s, id: crypto.randomUUID() })),
              ],
            });
            setError("");
          } catch (err) {
            setError(String(err));
          }
        }}
      />
      <div className="canvas-tools" role="toolbar" aria-label="Drawing tools">
        {tools.map(({ id, label, key, icon: Icon }) => (
          <button
            key={id}
            title={`${label} (${key})`}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => setTool(id)}
          >
            <Icon size={17} />
          </button>
        ))}
        <span className="canvas-tool-divider" />
        {colors.map((c) => (
          <button
            key={c}
            className="canvas-swatch"
            style={{ "--swatch": c } as React.CSSProperties}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            onClick={() => {
              setColor(c);
              if (selectedShape)
                commit({
                  ...doc.value,
                  shapes: doc.value.shapes.map((s) =>
                    s.id === selected ? { ...s, color: c } : s,
                  ),
                });
            }}
          />
        ))}
        <span className="creative-spacer" />
        <button
          aria-label="Delete selected shape"
          disabled={!selected}
          onClick={remove}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {(tool === "text" || selectedShape?.kind === "text") && (
        <label className="canvas-text-input">
          Text
          <input
            aria-label="Canvas text"
            maxLength={10000}
            value={selectedShape?.kind === "text" ? selectedShape.text : text}
            onChange={(e) => {
              if (selectedShape?.kind === "text")
                commit({
                  ...doc.value,
                  shapes: doc.value.shapes.map((s) =>
                    s.id === selected ? { ...s, text: e.target.value } : s,
                  ),
                });
              else setText(e.target.value);
            }}
          />
          <span>{tool === "text" ? "Click to place" : ""}</span>
        </label>
      )}
      {selectedShape && tool === "select" && (
        <div
          className="canvas-inspector"
          aria-label="Selected object properties"
        >
          <span>{selectedShape.kind}</span>
          {(
            [
              "x",
              "y",
              ...(selectedShape.kind === "rect" ||
              selectedShape.kind === "ellipse" ||
              selectedShape.kind === "arrow"
                ? ["w", "h"]
                : []),
            ] as ("x" | "y" | "w" | "h")[]
          ).map((key) => (
            <label key={key}>
              {key.toUpperCase()}
              <input
                type="number"
                aria-label={`Object ${key}`}
                value={selectedShape[key]}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && Math.abs(value) < 1000000)
                    commit({
                      ...doc.value,
                      shapes: doc.value.shapes.map((shape) =>
                        shape.id === selected
                          ? { ...shape, [key]: value }
                          : shape,
                      ),
                    });
                }}
              />
            </label>
          ))}
          <span className="creative-spacer" />
          <button
            aria-label="Duplicate object"
            title="Duplicate object"
            onClick={() => {
              const shape = {
                ...selectedShape,
                id: crypto.randomUUID(),
                x: selectedShape.x + 24,
                y: selectedShape.y + 24,
              };
              commit({ ...doc.value, shapes: [...doc.value.shapes, shape] });
              setSelected(shape.id);
            }}
          >
            <Copy size={14} />
          </button>
          <button
            aria-label="Bring to front"
            title="Bring to front"
            onClick={() =>
              commit({
                ...doc.value,
                shapes: [
                  ...doc.value.shapes.filter((shape) => shape.id !== selected),
                  selectedShape,
                ],
              })
            }
          >
            <BringToFront size={14} />
          </button>
          <button
            aria-label="Send to back"
            title="Send to back"
            onClick={() =>
              commit({
                ...doc.value,
                shapes: [
                  selectedShape,
                  ...doc.value.shapes.filter((shape) => shape.id !== selected),
                ],
              })
            }
          >
            <SendToBack size={14} />
          </button>
        </div>
      )}
      <div className="canvas-surface">
        <svg
          ref={svg}
          className={`canvas-board tool-${tool}`}
          role="application"
          aria-label="Drawing canvas"
          tabIndex={0}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            setDraft(null);
            drag.current = null;
          }}
        >
          <defs>
            <pattern
              id={`grid-${id}`}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r=".8" fill="var(--border)" />
            </pattern>
          </defs>
          <rect
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill={`url(#grid-${id})`}
          />
          <rect
            x="0"
            y="0"
            width="1200"
            height="800"
            fill="none"
            stroke="var(--border)"
            strokeDasharray="6 6"
          />
          {doc.value.shapes
            .filter((s) => s.id !== draft?.id)
            .map((s) => (
              <g
                key={s.id}
                data-shape={s.id}
                className={selected === s.id ? "canvas-selected" : ""}
              >
                <ShapeView s={s} selected={selected === s.id} />
              </g>
            ))}
          {draft && (
            <g>
              <ShapeView s={draft} selected />
            </g>
          )}
        </svg>
        {!doc.value.shapes.length && !draft && (
          <div className="canvas-welcome">
            <Square size={28} />
            <strong>Make room for an idea.</strong>
            <span>Sketch a system. Map a journey. Think on a page.</span>
            <button
              onClick={() => {
                const shapes: Shape[] = [
                  {
                    id: crypto.randomUUID(),
                    kind: "rect",
                    x: 180,
                    y: 270,
                    w: 220,
                    h: 130,
                    color: colors[0],
                    text: "",
                    points: [],
                  },
                  {
                    id: crypto.randomUUID(),
                    kind: "text",
                    x: 225,
                    y: 345,
                    w: 0,
                    h: 0,
                    color: colors[0],
                    text: "An idea",
                    points: [],
                  },
                  {
                    id: crypto.randomUUID(),
                    kind: "arrow",
                    x: 425,
                    y: 335,
                    w: 180,
                    h: 0,
                    color: colors[2],
                    text: "",
                    points: [],
                  },
                  {
                    id: crypto.randomUUID(),
                    kind: "ellipse",
                    x: 630,
                    y: 265,
                    w: 220,
                    h: 140,
                    color: colors[1],
                    text: "",
                    points: [],
                  },
                  {
                    id: crypto.randomUUID(),
                    kind: "text",
                    x: 675,
                    y: 345,
                    w: 0,
                    h: 0,
                    color: colors[1],
                    text: "A plan",
                    points: [],
                  },
                ];
                commit({ ...doc.value, shapes });
              }}
              disabled={!doc.ready}
            >
              Start with a diagram
            </button>
          </div>
        )}
        <div className="canvas-zoom">
          <button aria-label="Zoom out" onClick={() => zoom(1.25)}>
            <ZoomOut size={15} />
          </button>
          <span>{Math.round((1200 / view.w) * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(0.8)}>
            <ZoomIn size={15} />
          </button>
          <button
            aria-label="Fit board"
            onClick={() => setView({ x: 0, y: 0, w: 1200, h: 800 })}
          >
            <Maximize size={15} />
          </button>
        </div>
      </div>
      {(doc.error || error) && (
        <div className="creative-error" role="alert">
          {doc.error || error}
          {doc.error && (
            <button onClick={() => void doc.reload()}>
              Reload disk version
            </button>
          )}
        </div>
      )}
      <footer className="creative-status">
        <span>{doc.status}</span>
        <span>
          {doc.value.shapes.length} objects ·{" "}
          {tool === "select"
            ? "Drag to move"
            : tool === "pan"
              ? "Drag to pan"
              : "Drag to draw"}{" "}
          · 1200 × 800
        </span>
      </footer>
    </div>
  );
}
