"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Copy,
  Keyboard,
  Folder,
  Download,
  Bot,
  BookOpen,
  Code2,
  TerminalSquare,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react";
import { useDesktop } from "@/lib/state/store";
import { useAgentConfig } from "@/lib/agent/settings";
import { apps, type AppId } from "@/lib/apps/registry";
import { fs } from "@/lib/fs/opfs";
import { formatBytes } from "@/lib/files/kinds";
import {
  describeModel,
  probeJSON,
  type DiagnosticRow,
} from "@/lib/apps/diagnostics";
export default function ApplicationHelp({ onBack }: { onBack: () => void }) {
  const [checks, setChecks] = useState<DiagnosticRow[]>([]),
    [checking, setChecking] = useState(false),
    [checkedAt, setCheckedAt] = useState(""),
    [copied, setCopied] = useState(""),
    [refresh, setRefresh] = useState(0);
  const mode = useAgentConfig((s) => s.mode),
    model = useAgentConfig((s) => s.model),
    authenticated = useAgentConfig((s) => s.authenticated),
    status = useDesktop((s) => s.agentStatus),
    modifier = useDesktop((s) => s.modifier);
  const modelRow = describeModel({ mode, model, authenticated, status });
  const launch = (id: AppId, path?: string) =>
    useDesktop.getState().launch(id, path);
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    (async () => {
      const rows: DiagnosticRow[] = [];
      rows.push({
        label: "Current address",
        value: location.origin,
        detail:
          "Files belong to this address and this browser. Another origin or browser starts with separate storage.",
        status: "info",
      });
      if (!navigator.storage?.getDirectory)
        rows.push({
          label: "Filesystem",
          value: "OPFS unavailable",
          detail:
            "Use a current browser on HTTPS or localhost to save local files.",
          status: "error",
        });
      else {
        try {
          const entries = await fs.ls("/home/guest");
          rows.push({
            label: "Filesystem",
            value: "Readable",
            detail: `Home directory is available (${entries.length} top-level entries). This check does not create or modify files.`,
            status: "ok",
          });
        } catch {
          rows.push({
            label: "Filesystem",
            value: "Could not read home",
            detail:
              "Open Files to inspect the error. Storage may be blocked or initialization may still be in progress.",
            status: "error",
          });
        }
      }
      try {
        const estimate = await navigator.storage.estimate(),
          persisted = await navigator.storage.persisted();
        rows.push({
          label: "Storage",
          value: `${formatBytes(estimate.usage ?? 0)} used`,
          detail: `${estimate.quota ? formatBytes(estimate.quota) + " browser quota. " : ""}${persisted ? "Persistent storage granted." : "Browser-managed storage; keep an exported backup."}`,
          status: "info",
        });
      } catch {
        rows.push({
          label: "Storage estimate",
          value: "Not exposed",
          detail:
            "Your browser did not expose an estimate. You can still check Files and export a backup.",
          status: "info",
        });
      }
      const [health, auth, remote] = await Promise.all([
        probeJSON("/api/health"),
        probeJSON("/api/agent-config"),
        probeJSON("/api/browser-runtime?capabilities=1"),
      ]);
      rows.push({
        label: "Application backend",
        value:
          health.ok && health.data.ok === true
            ? "Reachable"
            : health.status
              ? `HTTP ${health.status}`
              : "Not reachable",
        detail: health.ok
          ? "The application health endpoint answered. This is not a model-provider test."
          : "Existing local documents remain usable. Network-backed browsing and ChatGPT login may need the server restored.",
        status: health.ok ? "ok" : "error",
      });
      const chatgpt = auth.data.chatgpt as { enabled?: boolean } | undefined;
      rows.push({
        label: "ChatGPT helper",
        value: auth.ok
          ? chatgpt?.enabled
            ? "Available"
            : "Not enabled here"
          : "Not reachable",
        detail: chatgpt?.enabled
          ? "Bundled authentication is available. Sign in from Agent to connect your own account."
          : "Direct provider mode is an alternative in Agent settings. No model is needed for the desktop.",
        status: chatgpt?.enabled ? "ok" : "info",
      });
      rows.push({
        label: "Interactive web browser",
        value:
          remote.ok && remote.data.available === true
            ? "Available"
            : "Document / Embed modes",
        detail:
          remote.ok && remote.data.available === true
            ? "A Chromium runtime is available. Opening an interactive session remains an explicit Browser action."
            : "Local HTML apps still run. Document mode works through the server; Embed mode depends on each site’s embedding policy.",
        status: remote.ok && remote.data.available === true ? "ok" : "info",
      });
      rows.push({
        label: "Browser capabilities",
        value: [
          typeof WebAssembly !== "undefined" ? "WebAssembly" : "No WebAssembly",
          "AudioContext" in window ? "Web Audio" : "No Web Audio",
          navigator.maxTouchPoints ? "Touch" : "Mouse / keyboard",
        ].join(" · "),
        detail: `${window.isSecureContext ? "Secure context." : "Not a secure context."} ${"modelContext" in navigator ? "Browser modelContext is present, but oma.os does not register native WebMCP tools. Use the documented desktop command bus." : "Browser-native WebMCP is not exposed here; use the documented desktop command bus."}`,
        status: "info",
      });
      rows.push({
        label: "App registry",
        value: `${Object.keys(apps).filter((id) => id !== "notice").length} registered apps`,
        detail: Object.values(apps)
          .filter((app) => app.id !== "notice")
          .map((app) => app.title)
          .join(" · "),
        status: "ok",
      });
      if (!cancelled) {
        setChecks(rows);
        setCheckedAt(new Date().toISOString());
        setChecking(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setChecks([
          {
            label: "Diagnostics",
            value: "Check interrupted",
            detail: "Retry the check. No files or settings were changed.",
            status: "error",
          },
        ]);
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  return (
    <div className="application-help">
      <header>
        <button onClick={onBack}>
          <ArrowLeft size={14} />
          Applications
        </button>
        <strong>Start here · Help & diagnostics</strong>
      </header>
      <div className="application-help-scroll">
        <section className="application-help-intro">
          <h2>A working desktop. Model optional.</h2>
          <p>
            Write a note, run Python, make music, sketch a diagram, or build an
            HTML app. Your work saves locally in this browser. Connecting a
            model adds an agent; it is not a prerequisite.
          </p>
          <div>
            <button onClick={() => launch("notes")}>
              <BookOpen size={14} />
              Start a note
            </button>
            <button onClick={() => launch("agent")}>
              <Bot size={14} />
              Configure an agent
            </button>
          </div>
        </section>
        <div className="application-help-guides">
          <section>
            <Keyboard size={18} />
            <h3>Find and control anything</h3>
            <p>
              <kbd>Cmd+K</kbd> opens the launcher on Mac. Search apps, files,
              and commands. Use the top bar’s workspace numbers and window
              controls, or drag a divider to resize.
            </p>
            <p>
              Your desktop modifier is{" "}
              <strong>
                {modifier === "alt" ? "Alt / Option" : "Control + Shift"}
              </strong>
              . Host OS shortcuts may take priority; all essential controls have
              clickable alternatives.
            </p>
            <button onClick={() => useDesktop.getState().setOverlay("keys")}>
              All keyboard shortcuts
            </button>
          </section>
          <section>
            <Download size={18} />
            <h3>Keep a copy of your work</h3>
            <p>
              Open <strong>Settings → Storage & backup</strong> for a portable
              ZIP. It includes local files, installed app source, and oma.os
              configuration. Provider keys and server login credentials are
              excluded.
            </p>
            <p>
              Files also exports individual files and folders. Note, drawing,
              image, and data apps offer their own export formats.
            </p>
            <button onClick={() => launch("settings")}>Open Settings</button>
          </section>
          <section>
            <Code2 size={18} />
            <h3>Apps are editable files</h3>
            <p>
              Add Pulse, Image Studio, or Regex Lab from Applications. Their
              source lands in <code>/home/guest/Applications</code>. Use the
              source button to edit HTML, then run it in Browser.
            </p>
            <p>
              Desktop layout and open app paths restore on reload. Watch each
              app’s save state before leaving, and export work you want to keep.
            </p>
            <button onClick={() => launch("files", "/home/guest/Applications")}>
              Open application files
            </button>
          </section>
          <section>
            <TerminalSquare size={18} />
            <h3>A shared surface for agents</h3>
            <p>
              The terminal and configured agent use the same desktop command bus
              and filesystem. Start with <code>oma help</code>,{" "}
              <code>oma apps</code>, and <code>oma window list</code>.
            </p>
            <p>
              The local skill explains paths and controls. Agent tools show
              their activity and ask for approval before replacing existing
              files.
            </p>
            <button onClick={() => launch("editor", "/.oma/SKILL.md")}>
              Read the local agent guide
            </button>
            <button onClick={() => launch("activity")}>Session activity</button>
          </section>
        </div>
        <section className="application-diagnostics">
          <div className="applications-section">
            <h2>What is available right now</h2>
            <div>
              <button
                disabled={checking}
                onClick={() => {
                  setRefresh((v) => v + 1);
                  setCopied("");
                }}
              >
                <RefreshCw size={13} />
                {checking ? "Checking…" : "Run checks"}
              </button>
              <button
                disabled={checking || !checks.length}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      JSON.stringify(
                        {
                          checkedAt,
                          checks: [modelRow, ...checks],
                        },
                        null,
                        2,
                      ),
                    );
                    setCopied("Copied");
                  } catch {
                    setCopied("Clipboard unavailable");
                  }
                }}
              >
                <Copy size={13} />
                {copied || "Copy report"}
              </button>
            </div>
          </div>
          <p className="application-diagnostics-note">
            Read-only checks without model calls. Reports exclude file contents,
            conversations, provider keys, and login tokens.
          </p>
          {[modelRow, ...checks].map((row) => {
            const Icon =
              row.status === "error"
                ? AlertCircle
                : row.status === "ok"
                  ? CheckCircle2
                  : Circle;
            return (
              <div
                className={"application-diagnostic " + row.status}
                key={row.label}
              >
                <Icon size={15} />
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <p>{row.detail}</p>
                </div>
              </div>
            );
          })}
          {!!checks.length && (
            <details className="application-report">
              <summary>View report for manual copy</summary>
              <pre>
                {JSON.stringify(
                  { checkedAt, checks: [modelRow, ...checks] },
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
