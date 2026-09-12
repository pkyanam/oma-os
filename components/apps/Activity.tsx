"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity as ActivityIcon,
  Download,
  Trash2,
  AppWindow,
  FolderSync,
  ArrowRight,
  Layers,
} from "lucide-react";
import { apps, type AppId } from "@/lib/apps/registry";
import {
  activityStore,
  exportActivity,
  ACTIVITY_LIMIT,
  type ActivityEvent,
} from "@/lib/activity/store";
import "./activity.css";

const category = (event: ActivityEvent) =>
  event.kind === "filesystem-updated"
    ? "Files"
    : event.kind === "workspace-changed"
      ? "Workspaces"
      : event.kind === "desktop-ready"
        ? "System"
        : "Windows";
function description(event: ActivityEvent) {
  const app =
    event.app && Object.hasOwn(apps, event.app)
      ? apps[event.app as AppId].title
      : "Window";
  switch (event.kind) {
    case "desktop-ready":
      return `Desktop ready${event.count !== undefined ? ` · ${event.count} open windows` : ""}`;
    case "app-opened":
      return `Opened ${app}`;
    case "app-closed":
      return `Closed ${app}`;
    case "window-focused":
      return `Focused ${app}`;
    case "workspace-changed":
      return `Workspace ${event.fromWorkspace ?? "—"} → ${event.workspace ?? "—"}`;
    case "filesystem-updated":
      return "Filesystem updated";
  }
}
export default function Activity() {
  const snapshot = useSyncExternalStore(
    activityStore.subscribe,
    activityStore.getSnapshot,
    activityStore.getSnapshot,
  );
  const [filter, setFilter] = useState("All"),
    [confirmation, setConfirmation] = useState(false);
  const visible = useMemo(
    () =>
      snapshot.events
        .filter((event) => filter === "All" || category(event) === filter)
        .toReversed(),
    [snapshot, filter],
  );
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([exportActivity(snapshot)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `oma-session-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="activity-app">
      <header className="activity-toolbar">
        <ActivityIcon size={17} />
        <strong>Session activity</strong>
        <span>{snapshot.events.length} events</span>
        <button
          aria-label="Export session activity"
          title="Export JSON"
          onClick={download}
          disabled={!snapshot.events.length}
        >
          <Download size={16} />
        </button>
        <button
          aria-label="Clear session activity"
          title="Clear activity"
          onClick={() => setConfirmation(true)}
          disabled={!snapshot.events.length}
        >
          <Trash2 size={16} />
        </button>
      </header>
      <p className="activity-intro">
        A view of this desktop session. App and workspace actions only; file
        updates have no paths or contents. Cleared when the page reloads.
      </p>
      <nav className="activity-filters" aria-label="Activity filters">
        {["All", "Windows", "Workspaces", "Files", "System"].map((name) => (
          <button
            key={name}
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      {confirmation && (
        <div className="activity-confirmation">
          <span>Clear this session’s activity?</span>
          <button onClick={() => setConfirmation(false)}>Keep</button>
          <button
            onClick={() => {
              activityStore.clear();
              setConfirmation(false);
            }}
          >
            Clear
          </button>
        </div>
      )}
      <div className="activity-events" aria-label="Session events">
        {visible.length ? (
          <ol>
            {visible.map((event) => {
              const Icon =
                event.kind === "filesystem-updated"
                  ? FolderSync
                  : event.kind === "workspace-changed"
                    ? ArrowRight
                    : event.kind === "desktop-ready"
                      ? Layers
                      : AppWindow;
              return (
                <li key={event.id}>
                  <Icon size={15} />
                  <div>
                    <strong>{description(event)}</strong>
                    <small>
                      {event.kind !== "workspace-changed" && event.workspace
                        ? `Workspace ${event.workspace}`
                        : category(event)}
                    </small>
                  </div>
                  <time
                    dateTime={new Date(event.time).toISOString()}
                    title={new Date(event.time).toLocaleString()}
                  >
                    {new Date(event.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="activity-empty">
            <ActivityIcon size={26} />
            <strong>
              {filter === "All"
                ? "A fresh timeline."
                : `No ${filter.toLowerCase()} activity yet.`}
            </strong>
            <p>
              Open an app, switch workspaces, or save a file to see activity
              here.
            </p>
          </div>
        )}
      </div>
      <footer className="activity-footer">
        <span>Latest {ACTIVITY_LIMIT} events · memory only</span>
        <span>
          {snapshot.discarded
            ? `${snapshot.discarded} older events dropped`
            : "Not a durable audit log"}
        </span>
      </footer>
    </div>
  );
}
