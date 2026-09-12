"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import {
  getOfflineStatus,
  enableOffline,
  disableOffline,
} from "@/lib/offline/client";
type OfflineStatus = Awaited<ReturnType<typeof getOfflineStatus>>;
export default function OfflineSettings() {
  const [status, setStatus] = useState<OfflineStatus>(),
    [action, setAction] = useState<"enable" | "disable" | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const mounted = useRef(false),
    pending = useRef(false);
  const refresh = useCallback(async () => {
    const next = await getOfflineStatus();
    if (mounted.current) setStatus(next);
    return next;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((cause) => {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (action !== "enable" && status?.phase !== "downloading") return;
    let reading = false;
    const timer = setInterval(() => {
      if (reading) return;
      reading = true;
      void refresh()
        .catch(() => {})
        .finally(() => {
          reading = false;
        });
    }, 750);
    return () => clearInterval(timer);
  }, [action, status?.phase, refresh]);
  const run = async (kind: "enable" | "disable") => {
    if (pending.current) return;
    pending.current = true;
    setAction(kind);
    setError("");
    setMessage("");
    try {
      if (kind === "enable") await enableOffline();
      else await disableOffline();
      const next = await refresh();
      if (mounted.current)
        setMessage(
          kind === "disable"
            ? "Offline cache removed. Local files are unchanged."
            : next.ready
              ? "Offline files are ready."
              : "Offline setup has not finished. Check the status before disconnecting.",
        );
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : String(cause));
      await refresh().catch(() => {});
    } finally {
      pending.current = false;
      if (mounted.current) setAction(null);
    }
  };
  const downloading = action === "enable" || status?.phase === "downloading";
  const failure = error || status?.error;
  const progress = status?.progress;
  return (
    <section
      className="settings-section"
      aria-labelledby="offline-settings-heading"
    >
      <div className="settings-section-icon">
        <WifiOff size={20} />
      </div>
      <div>
        <h2 id="offline-settings-heading">Offline access</h2>
        <p>
          Download the desktop, Applications, Notes and Settings for offline
          use. Other apps may work if their files were previously cached. AI
          connections, websites and uncached runtimes still need a network
          connection.
        </p>
        <p className="settings-small">
          This is an optional download. Browser storage can be cleared or
          evicted; keep file backups separately.
        </p>
        {!status && !error && <p>Checking offline support…</p>}
        {status && !status.supported && (
          <p>
            Offline downloads are available in the production Cloudflare build
            when this browser supports service workers.
          </p>
        )}
        {status?.supported && !downloading && (
          <p>
            {status.ready
              ? "Offline files ready."
              : status.enabled
                ? "Offline download is not ready."
                : "Offline access is off."}
          </p>
        )}
        {downloading && (
          <div className="offline-download">
            <p role="status">
              {progress && progress.total > 0
                ? `Downloading files: ${progress.completed} of ${progress.total}.`
                : "Preparing offline download…"}
            </p>
            <progress
              aria-label="Offline download progress"
              max={progress?.total || 1}
              value={
                progress && progress.total > 0 ? progress.completed : undefined
              }
            />
          </div>
        )}
        {status?.ready && <p>After saving your work, reopen or reload the desktop once before going offline.</p>}
        {status?.updateWaiting && (
          <p>
            A downloaded update is waiting. Close all oma.os tabs and reopen the
            app to apply it. This page will not reload automatically.
          </p>
        )}
        {status?.supported && (
          <div className="setting-actions">
            {!status.ready && (
              <button
                disabled={!!action || downloading}
                onClick={() => void run("enable")}
              >
                <Download size={14} />
                {downloading
                  ? "Downloading…"
                  : failure
                    ? "Retry offline download"
                    : "Enable offline access"}
              </button>
            )}
            {status.enabled && (
              <button
                disabled={!!action || downloading}
                onClick={() => void run("disable")}
              >
                {action === "disable"
                  ? "Removing cache…"
                  : "Disable offline access"}
              </button>
            )}
            <button
              aria-label="Refresh offline status"
              disabled={!!action}
              onClick={() => {
                setError("");
                setMessage("");
                void refresh().catch((cause) =>
                  setError(
                    cause instanceof Error ? cause.message : String(cause),
                  ),
                );
              }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
        {message && !downloading && (
          <p role="status" className="settings-feedback">
            {message}
          </p>
        )}
        {failure && !downloading && (
          <p role="alert" className="settings-error">
            {failure}
          </p>
        )}
      </div>
    </section>
  );
}
