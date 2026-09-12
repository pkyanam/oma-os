"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Download,
  HardDrive,
  Keyboard,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useDesktop } from "@/lib/state/store";
import {
  createBackup,
  inspectBackup,
  restoreBackup,
  type BackupPreview,
} from "@/lib/fs/backup";
import { formatBytes } from "@/lib/files/kinds";
import "./system-apps.css";
import OfflineSettings from "./OfflineSettings";

export default function Settings() {
  const [section, setSection] = useState("general"),
    [usage, setUsage] = useState<StorageEstimate>({}),
    [persistent, setPersistent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null),
    [overwrite, setOverwrite] = useState(false),
    [auth, setAuth] = useState<{
      enabled: boolean;
      storage: string;
      reason?: string;
    }>();
  const upload = useRef<HTMLInputElement>(null),
    modifier = useDesktop((state) => state.modifier);
  const refresh = useCallback(async () => {
    const [estimate, persisted] = await Promise.all([
      navigator.storage?.estimate?.(),
      navigator.storage?.persisted?.(),
    ]);
    setUsage(estimate ?? {});
    setPersistent(!!persisted);
  }, []);
  useEffect(() => {
    void refresh().catch(() => {});
    void fetch("/api/agent-config")
      .then((response) => response.json())
      .then((data) => setAuth(data.chatgpt))
      .catch(() => {});
  }, [refresh]);
  const operation = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      void refresh().catch(() => {});
    }
  };
  const ensureSaved = () => {
    if (Object.values(useDesktop.getState().dirty).some(Boolean))
      throw new Error(
        "Save your open documents before backing up or restoring files.",
      );
  };
  const backup = () =>
    operation(async () => {
      ensureSaved();
      const { data, manifest } = await createBackup();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `oma-os-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `Backup ready: ${manifest.files} files, ${formatBytes(manifest.bytes)}. Store it somewhere you trust.`,
      );
    });
  const restore = () =>
    operation(async () => {
      if (!preview) return;
      ensureSaved();
      const result = await restoreBackup(preview, overwrite, {
        beforeWrite: ensureSaved,
      });
      useDesktop.getState().refreshFs();
      setPreview(null);
      setMessage(
        `Restored ${result.restored} files; skipped ${result.skipped} existing files.${result.failures.length ? ` ${result.failures.length} files could not be restored.` : ""}${result.stopped ? ` Restore stopped: ${result.stopped} Already restored files remain on disk.` : ""}`,
      );
      if (result.failures.length)
        setError(result.failures.slice(0, 8).join("\n"));
    });
  return (
    <div className="system-app settings-app">
      <header className="system-app-heading">
        <h1>Settings</h1>
      </header>
      <nav className="system-tabs" aria-label="Settings sections">
        {[
          ["general", "Desktop"],
          ["storage", "Storage & backup"],
          ["about", "About"],
        ].map(([id, title]) => (
          <button
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {title}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {section === "general" && (
          <>
            <section className="settings-section">
              <div className="settings-section-icon">
                <Keyboard size={20} />
              </div>
              <div>
                <h2>Keyboard & windows</h2>
                <p>
                  Use ⌘K to open the launcher on a Mac. Ctrl+Space works where
                  the operating system allows it. Every window action is also
                  available from the top bar.
                </p>
                <div className="setting-options">
                  <button
                    aria-pressed={modifier === "alt"}
                    onClick={() => useDesktop.setState({ modifier: "alt" })}
                  >
                    Option / Alt{modifier === "alt" && <Check size={13} />}
                  </button>
                  <button
                    aria-pressed={modifier === "control-shift"}
                    onClick={() =>
                      useDesktop.setState({ modifier: "control-shift" })
                    }
                  >
                    Control + Shift
                    {modifier === "control-shift" && <Check size={13} />}
                  </button>
                </div>
                <div className="setting-actions">
                  <button
                    onClick={() => useDesktop.getState().setOverlay("keys")}
                  >
                    All shortcuts
                  </button>
                  <button
                    onClick={() =>
                      useDesktop.getState().setOverlay("shortcuts")
                    }
                  >
                    Fullscreen & keyboard capture
                  </button>
                </div>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-icon">
                <Monitor size={20} />
              </div>
              <div>
                <h2>Install app</h2>
                <p>
                  Install oma.os using your browser’s “Install app” or “Add to
                  Dock / Home Screen” action. A separate app window gives the
                  desktop more space and fewer conflicting shortcuts.
                </p>
                <button
                  className="system-action"
                  onClick={() => useDesktop.getState().setOverlay("window")}
                >
                  Manage open windows
                </button>
              </div>
            </section>
            <OfflineSettings />
          </>
        )}
        {section === "storage" && (
          <>
            <section className="settings-section">
              <div className="settings-section-icon">
                <HardDrive size={20} />
              </div>
              <div>
                <h2>Storage</h2>
                <div
                  className="storage-meter"
                  role="meter"
                  aria-label="Browser storage used"
                  aria-valuemin={0}
                  aria-valuemax={usage.quota ?? 1}
                  aria-valuenow={usage.usage ?? 0}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (100 * (usage.usage ?? 0)) / Math.max(1, usage.quota ?? 1))}%`,
                    }}
                  />
                </div>
                <p>
                  {formatBytes(usage.usage ?? 0)} used ·{" "}
                  {usage.quota
                    ? `${formatBytes(usage.quota)} browser quota`
                    : "Quota unavailable"}
                </p>
                <p>
                  Files belong to this browser and this address. Another device,
                  browser, or deployment has its own filesystem. Clearing site
                  data removes local files.
                </p>
                <div className="setting-actions">
                  <button
                    disabled={busy || persistent}
                    onClick={() =>
                      void operation(async () => {
                        if (!navigator.storage?.persist)
                          throw new Error(
                            "This browser does not expose persistent storage requests.",
                          );
                        const granted = await navigator.storage.persist();
                        setPersistent(granted);
                        setMessage(
                          granted
                            ? "Persistent storage granted. Keep backups for anything important."
                            : "The browser did not grant persistence. You can still export backups.",
                        );
                      })
                    }
                  >
                    <ShieldCheck size={14} />
                    {persistent
                      ? "Persistent storage granted"
                      : "Request persistent storage"}
                  </button>
                  <button
                    aria-label="Refresh storage usage"
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-icon">
                <Archive size={20} />
              </div>
              <div>
                <h2>Backup & restore</h2>
                <p>
                  Export a ZIP containing your home files and oma.os
                  configuration, including saved agent conversations. Desktop
                  layout and keyboard preferences stored by this browser are not
                  included. Server authentication credentials and provider keys
                  are excluded.
                </p>
                <div className="setting-actions">
                  <button disabled={busy} onClick={() => void backup()}>
                    <Download size={14} />
                    Export backup
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => upload.current?.click()}
                  >
                    <Upload size={14} />
                    Import backup
                  </button>
                </div>
                <p className="settings-small">
                  Up to 128 MB and 4,999 files per backup. Larger folders can be
                  exported individually from Files.
                </p>
                <input
                  ref={upload}
                  type="file"
                  hidden
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void operation(async () => {
                      if (file.size > 128 * 1024 * 1024)
                        throw new Error("Backup exceeds 128 MB.");
                      setOverwrite(false);
                      setPreview(
                        await inspectBackup(
                          new Uint8Array(await file.arrayBuffer()),
                        ),
                      );
                    });
                  }}
                />
              </div>
            </section>
            {preview && (
              <section className="backup-review">
                <header>
                  <h2>Review backup import</h2>
                  <button
                    aria-label="Cancel backup import"
                    disabled={busy}
                    onClick={() => setPreview(null)}
                  >
                    <X size={16} />
                  </button>
                </header>
                <p>
                  {preview.paths.length} files · {formatBytes(preview.bytes)} ·
                  created{" "}
                  {new Date(preview.manifest.createdAt).toLocaleString()}
                </p>
                <p>
                  {preview.existing.length} files already exist. They will be
                  skipped unless you choose to replace them. Files changed since
                  this preview are protected; import the backup again to review
                  a fresh preview. Restoration stops if an open document becomes
                  unsaved.
                </p>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={overwrite}
                    onChange={(event) => setOverwrite(event.target.checked)}
                  />
                  Replace {preview.existing.length} existing files
                </label>
                <details>
                  <summary>Files in this backup</summary>
                  <pre>{preview.paths.join("\n")}</pre>
                </details>
                <button
                  className="system-action"
                  disabled={busy}
                  onClick={() => void restore()}
                >
                  {busy ? "Restoring…" : "Restore files"}
                </button>
              </section>
            )}
          </>
        )}
        {section === "about" && (
          <>
            <section className="settings-section">
              <div className="settings-section-icon">⌘</div>
              <div>
                <h2>oma.os</h2>
                <p>
                  A browser desktop inspired by Omarchy. Open source under the
                  MIT license.
                </p>
                <dl className="system-facts">
                  <dt>Files</dt>
                  <dd>Origin Private File System</dd>
                  <dt>Terminal</dt>
                  <dd>Just Bash · browser worker</dd>
                  <dt>Python</dt>
                  <dd>Pyodide · browser worker</dd>
                  <dt>Agent</dt>
                  <dd>AI SDK ToolLoopAgent</dd>
                  <dt>ChatGPT login</dt>
                  <dd>
                    {auth
                      ? auth.enabled
                        ? `Bundled service · ${auth.storage} sessions`
                        : auth.reason
                      : "Checking…"}
                  </dd>
                </dl>
                <p className="settings-small">
                  Browser runtimes have real limits. Native executables and a
                  Linux kernel are not part of this desktop. Installed HTML apps
                  run in isolated frames; some network websites require the
                  optional Chromium service.
                </p>
                <div className="setting-actions">
                  <button
                    onClick={() =>
                      useDesktop
                        .getState()
                        .launch("browser", "https://github.com/pkyanam/oma-os")
                    }
                  >
                    Source & documentation
                  </button>
                  <button
                    onClick={() =>
                      useDesktop.getState().launch("editor", "/.oma/SKILL.md")
                    }
                  >
                    Agent operating guide
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
        {(busy || message) && (
          <p role="status" className="settings-feedback">
            {busy ? "Working…" : message}
          </p>
        )}
        {error && (
          <pre role="alert" className="settings-error">
            {error}
          </pre>
        )}
      </div>
    </div>
  );
}
