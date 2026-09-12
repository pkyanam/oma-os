"use client";
import { useEffect, useState } from "react";
import {
  Command,
  HardDrive,
  ChevronRight,
  ChevronDown,
  Keyboard,
  Circle,
  Plus,
} from "lucide-react";
import { useDesktop } from "@/lib/state/store";
import { oma } from "@/lib/oma/bus";
import { fs } from "@/lib/fs/opfs";
export default function Bar() {
  const s = useDesktop(),
    [clock, setClock] = useState(""),
    [storage, setStorage] = useState("—");
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setClock(
        d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        }) +
          "  " +
          d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    void navigator.storage?.estimate().then((e) => {
      const bytes = e.usage ?? 0;
      setStorage(
        bytes < 1048576
          ? Math.max(1, Math.round(bytes / 1024)) + " KB"
          : (bytes / 1048576).toFixed(1) + " MB",
      );
    });
  }, [s.fsVersion]);
  const focus = s.workspaces[s.workspace].focus,
    tile = focus ? s.tiles[focus] : null;
  useEffect(() => {
    document
      .querySelector('.bar nav [aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [s.workspace]);
  return (
    <header className="bar">
      <div className="bar-left">
        <button
          className="system-button"
          aria-label="Open launcher"
          title="Launcher · ⌘K / Ctrl+Space"
          onClick={() => s.setOverlay("launcher")}
        >
          <Command size={15} />
        </button>
        <nav aria-label="Workspaces">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              aria-label={`Workspace ${n}`}
              aria-current={s.workspace === n ? "page" : undefined}
              className={
                "workspace-button " +
                (s.workspace === n
                  ? "active"
                  : s.workspaces[n].layout
                    ? "occupied"
                    : "")
              }
              onClick={() =>
                void oma(["ws", String(n)], { store: useDesktop, fs })
              }
            >
              {n}
            </button>
          ))}
        </nav>
        <span className="bar-divider" />
        <button
          className="wordmark"
          onClick={() => s.setOverlay("menu")}
          title="System menu · Ctrl+."
        >
          oma.os
        </button>
        <button
          className="quick-terminal"
          aria-label="New terminal"
          title="New terminal"
          onClick={() =>
            void oma(["launch", "term"], { store: useDesktop, fs })
          }
        >
          <Plus size={13} />
        </button>
        <button
          className="focused-class window-control"
          aria-label="Window controls"
          title="Window controls · close, resize, fullscreen"
          onClick={() => s.setOverlay("window")}
        >
          <span>
            {tile?.title ?? "windows"}
            {focus && s.dirty[focus] && " *"}
          </span>
          {tile && <ChevronDown size={10} />}
        </button>
      </div>
      <time aria-label={clock} title={clock}>
        <span className="clock-date">{clock.split("  ")[0]}</span>
        <span>{clock.split("  ")[1]}</span>
      </time>
      <div className="bar-right">
        <button
          className="bar-agent"
          onClick={() =>
            void oma(["launch", "agent"], { store: useDesktop, fs })
          }
        >
          <ChevronRight size={13} />
          <span>agent</span>
          <span className="muted">{s.agentStatus}</span>
        </button>
        <span className="bar-divider" />
        <span className="storage" title="Browser storage used">
          <HardDrive size={12} />
          {storage}
        </span>
        <button className="theme-button" onClick={() => s.setOverlay("theme")}>
          <Circle size={8} />
          tokyo-night
        </button>
        <button
          className="key-button"
          title="Keyboard shortcuts · Alt+K"
          aria-label="Keyboard shortcuts"
          onClick={() => s.setOverlay("keys")}
        >
          <Keyboard size={14} />
        </button>
      </div>
    </header>
  );
}
