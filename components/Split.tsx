"use client";
import { useEffect, useRef } from "react";
import type { LayoutNode } from "@/lib/layout/tree";
import { useDesktop } from "@/lib/state/store";
export default function Split({
  node,
  path = "",
  x = 0,
  y = 0,
  w = 1,
  h = 1,
}: {
  node: LayoutNode;
  path?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}) {
  const pending = useRef<number | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const flushResize = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (pending.current !== null) {
      useDesktop.getState().resize(path, pending.current);
      pending.current = null;
    }
  };
  if (node.type === "leaf") return null;
  const row = node.dir === "row";
  const pos = row ? x + w * node.ratio : y + h * node.ratio;
  return (
    <>
      <div
        role="separator"
        aria-label={row ? "Resize columns" : "Resize rows"}
        aria-orientation={row ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(node.ratio * 100)}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuetext={`${Math.round(node.ratio * 100)} percent; arrow keys resize, Enter balances`}
        tabIndex={0}
        className={"gutter " + (row ? "gutter-row" : "gutter-col")}
        style={
          row
            ? {
                left: `calc(${pos * 100}% - 3px)`,
                top: `${y * 100}%`,
                height: `${h * 100}%`,
              }
            : {
                top: `calc(${pos * 100}% - 3px)`,
                left: `${x * 100}%`,
                width: `${w * 100}%`,
              }
        }
        onKeyDown={(e) => {
          if (["Home", "End", "Enter"].includes(e.key)) {
            e.preventDefault();
            useDesktop
              .getState()
              .resize(
                path,
                e.key === "Home" ? 0.2 : e.key === "End" ? 0.8 : 0.5,
              );
            return;
          }
          if (
            (row
              ? ["ArrowLeft", "ArrowRight"]
              : ["ArrowUp", "ArrowDown"]
            ).includes(e.key)
          ) {
            e.preventDefault();
            useDesktop
              .getState()
              .resize(
                path,
                node.ratio +
                  (["ArrowRight", "ArrowDown"].includes(e.key) ? 0.05 : -0.05),
              );
          }
        }}
        onDoubleClick={() => useDesktop.getState().resize(path, 0.5)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.dragging = "true";
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const box = e.currentTarget.parentElement!.getBoundingClientRect();
          const point = row
            ? (e.clientX - box.left) / box.width
            : (e.clientY - box.top) / box.height;
          pending.current = (point - (row ? x : y)) / (row ? w : h);
          if (!frame.current)
            frame.current = requestAnimationFrame(flushResize);
        }}
        onPointerUp={(e) => {
          flushResize();
          e.currentTarget.releasePointerCapture(e.pointerId);
          delete e.currentTarget.dataset.dragging;
        }}
        onLostPointerCapture={(e) => {
          flushResize();
          delete e.currentTarget.dataset.dragging;
        }}
      />
      <Split
        node={node.a}
        path={path + "a"}
        x={x}
        y={y}
        w={row ? w * node.ratio : w}
        h={row ? h : h * node.ratio}
      />
      <Split
        node={node.b}
        path={path + "b"}
        x={row ? x + w * node.ratio : x}
        y={row ? y : y + h * node.ratio}
        w={row ? w * (1 - node.ratio) : w}
        h={row ? h : h * (1 - node.ratio)}
      />
    </>
  );
}
