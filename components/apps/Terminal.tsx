"use client";
import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { useDesktop } from "@/lib/state/store";
import { fs } from "@/lib/fs/opfs";
import { createShellSession } from "@/lib/shell/client";
import "@xterm/xterm/css/xterm.css";
export default function Terminal({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    instance = useRef<XTerm | null>(null);
  useEffect(() => {
    if (!container.current) return;
    let disposed = false,
      busy = false,
      input = "",
      cursor = 0,
      historyIndex = 0;
    const history: string[] = [];
    const shell = createShellSession({ store: useDesktop, fs, tileId: id });
    const term = new XTerm({
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 3000,
      screenReaderMode: true,
      allowProposedApi: true,
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#7aa2f7",
        selectionBackground: "#292e42",
        black: "#32344a",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#565f89",
        brightWhite: "#c0caf5",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container.current);
    instance.current = term;
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      term.loadAddon(gl);
    } catch {
      /* DOM renderer remains available */
    }
    const location = () => {
      const full = shell.cwd
        .replace(/^\/home\/guest(?=\/|$)/, "~")
        .replace(/[\x00-\x1f\x7f]/g, "");
      const limit = Math.max(1, Math.min(36, term.cols - 16));
      return full.length > limit ? "…" + full.slice(-(limit - 1 || 1)) : full;
    };
    const prompt = () =>
      `\x1b[38;2;122;162;247moma.os\x1b[0m \x1b[38;2;125;207;255m${location()}\x1b[0m \x1b[38;2;158;206;106m▸\x1b[0m `;
    // Keep the editing line horizontal even when a tile is very narrow.
    // Otherwise clearing only the last wrapped row duplicates the entire prompt.
    const redraw = () => {
      const available = Math.max(1, term.cols - 11 - location().length),
        start = Math.max(0, cursor - available + 1),
        shown = input.slice(start, start + available).replace(/\n/g, "↵");
      term.write("\r\x1b[2K" + prompt() + shown);
      const back = shown.length - (cursor - start);
      if (back > 0) term.write(`\x1b[${back}D`);
    };
    term.writeln(
      "\x1b[38;2;86;95;137moma.os · Just Bash · type help · Ctrl+C stops\x1b[0m",
    );
    term.writeln("");
    term.write(prompt());
    term.attachCustomKeyEventHandler(
      (e) => !(e.altKey || (e.ctrlKey && e.code === "Space")),
    );
    const listener = term.onData((data) => {
      if (busy && data === "\u0003") {
        shell.cancel();
        return;
      }
      if (busy) return;
      if (data === "\r") {
        const value = input;
        term.write(
          "\r\x1b[2K" + prompt() + value.replace(/\n/g, "\r\n") + "\r\n",
        );
        if (value.trim()) {
          history.push(value);
          if (history.length > 500) history.shift();
        }
        historyIndex = history.length;
        input = "";
        cursor = 0;
        busy = true;
        void shell
          .execute(value)
          .then((result) => {
            if (disposed || !useDesktop.getState().tiles[id]) return;
            if (value.trim() === "clear") term.clear();
            else {
              if (result.stdout)
                term.write(result.stdout.replace(/\r?\n/g, "\r\n"));
              if (result.stderr)
                term.write(
                  "\x1b[38;2;247;118;142m" +
                    result.stderr.replace(/\r?\n/g, "\r\n") +
                    "\x1b[0m",
                );
              if (
                (result.stderr || result.stdout) &&
                !(result.stderr || result.stdout).endsWith("\n")
              )
                term.writeln("");
            }
            term.write(prompt());
          })
          .catch((error) => {
            if (!disposed) term.writeln(String(error) + "\r\n" + prompt());
          })
          .finally(() => {
            busy = false;
          });
      } else if (data === "\u0003") {
        term.write("^C\r\n" + prompt());
        input = "";
        cursor = 0;
      } else if (data === "\u007f") {
        if (cursor) {
          input = input.slice(0, cursor - 1) + input.slice(cursor);
          cursor--;
          redraw();
        }
      } else if (data === "\x1b[D") {
        cursor = Math.max(0, cursor - 1);
        redraw();
      } else if (data === "\x1b[C") {
        cursor = Math.min(input.length, cursor + 1);
        redraw();
      } else if (data === "\x1b[A" || data === "\x1b[B") {
        historyIndex = Math.max(
          0,
          Math.min(history.length, historyIndex + (data === "\x1b[A" ? -1 : 1)),
        );
        input = history[historyIndex] ?? "";
        cursor = input.length;
        redraw();
      } else if (data === "\x01") {
        cursor = 0;
        redraw();
      } else if (data === "\x05") {
        cursor = input.length;
        redraw();
      } else if (data === "\x15") {
        input = input.slice(cursor);
        cursor = 0;
        redraw();
      } else if (!data.startsWith("\x1b")) {
        const clean = data
          .replace(/\r\n?/g, "\n")
          .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "");
        input = input.slice(0, cursor) + clean + input.slice(cursor);
        cursor += clean.length;
        redraw();
      }
    });
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed && container.current?.clientWidth) fit.fit();
      }, 50);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    void document.fonts.ready.then(resize);
    resize();
    return () => {
      disposed = true;
      shell.dispose();
      clearTimeout(timer);
      observer.disconnect();
      listener.dispose();
      term.dispose();
      instance.current = null;
    };
  }, [id]);
  useEffect(() => {
    if (active) instance.current?.focus();
  }, [active]);
  return <div className="terminal" ref={container} aria-label="Terminal" />;
}
