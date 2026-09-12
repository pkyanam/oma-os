import { apps } from "@/lib/apps/registry";

export const ACTIVITY_LIMIT = 300;
export const activityKinds = [
  "desktop-ready",
  "app-opened",
  "app-closed",
  "window-focused",
  "workspace-changed",
  "filesystem-updated",
] as const;
export type ActivityKind = (typeof activityKinds)[number];
export type ActivityEvent = Readonly<{
  id: number;
  time: number;
  kind: ActivityKind;
  app?: string;
  workspace?: number;
  fromWorkspace?: number;
  count?: number;
}>;
export type ActivityInput = {
  kind: ActivityKind;
  app?: string;
  workspace?: number;
  fromWorkspace?: number;
  count?: number;
};
type Snapshot = Readonly<{
  events: readonly ActivityEvent[];
  startedAt: number;
  discarded: number;
}>;
const workspace = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 9
    ? value
    : undefined;

/** Allow-list at the recording boundary: unknown keys can never enter an event. */
export function safeActivity(input: unknown): ActivityInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!activityKinds.includes(value.kind as ActivityKind)) return null;
  const result: ActivityInput = { kind: value.kind as ActivityKind };
  if (
    ["app-opened", "app-closed", "window-focused"].includes(result.kind) &&
    typeof value.app === "string" &&
    Object.hasOwn(apps, value.app)
  )
    result.app = value.app;
  if (
    [
      "app-opened",
      "app-closed",
      "window-focused",
      "workspace-changed",
    ].includes(result.kind)
  )
    result.workspace = workspace(value.workspace);
  if (result.kind === "workspace-changed")
    result.fromWorkspace = workspace(value.fromWorkspace);
  if (
    result.kind === "desktop-ready" &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0 &&
    value.count <= 10_000
  )
    result.count = value.count;
  return result;
}

export function createActivityStore(now: () => number = Date.now) {
  let serial = 0;
  let snapshot: Snapshot = Object.freeze({
    events: Object.freeze([]),
    startedAt: now(),
    discarded: 0,
  });
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => {
    snapshot = Object.freeze(next);
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    record(input: unknown) {
      const safe = safeActivity(input);
      if (!safe) return;
      const event: ActivityEvent = Object.freeze({
        id: ++serial,
        time: now(),
        ...safe,
      });
      const events = [...snapshot.events, event];
      publish({
        ...snapshot,
        events: Object.freeze(events.slice(-ACTIVITY_LIMIT)),
        discarded:
          snapshot.discarded + Math.max(0, events.length - ACTIVITY_LIMIT),
      });
    },
    clear() {
      publish({ events: Object.freeze([]), startedAt: now(), discarded: 0 });
    },
  };
}
export const activityStore = createActivityStore();

/** Export is reconstructed field by field rather than spreading arbitrary objects. */
export function exportActivity(snapshot: Snapshot): string {
  return JSON.stringify(
    {
      format: "oma-session-activity",
      version: 1,
      startedAt: new Date(snapshot.startedAt).toISOString(),
      discarded: snapshot.discarded,
      events: snapshot.events.flatMap((event) => {
        const safe = safeActivity(event);
        if (!safe || !Number.isFinite(event.time)) return [];
        return [{ time: new Date(event.time).toISOString(), ...safe }];
      }),
    },
    null,
    2,
  );
}
