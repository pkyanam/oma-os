import type { useDesktop } from "@/lib/state/store";
import { ids } from "@/lib/layout/tree";
import { activityStore } from "./store";
type DesktopState = ReturnType<typeof useDesktop.getState>;
type Source = Pick<typeof useDesktop, "subscribe" | "getState">;
const subscriptions = new WeakMap<
  object,
  { count: number; stop: () => void }
>();

export function desktopActivityChanges(
  current: DesktopState,
  previous: DesktopState,
  record = activityStore.record,
) {
  if (!current.ready) return;
  if (!previous.ready) {
    record({ kind: "desktop-ready", count: Object.keys(current.tiles).length });
    return;
  }
  const workspaceFor = (state: DesktopState, tile: string) =>
    Number(
      Object.keys(state.workspaces).find((key) =>
        ids(state.workspaces[Number(key)].layout).includes(tile),
      ),
    ) || undefined;
  if (current.tiles !== previous.tiles) {
    for (const [id, tile] of Object.entries(current.tiles))
      if (!previous.tiles[id])
        record({
          kind: "app-opened",
          app: tile.app,
          workspace: workspaceFor(current, id),
        });
    for (const [id, tile] of Object.entries(previous.tiles))
      if (!current.tiles[id])
        record({
          kind: "app-closed",
          app: tile.app,
          workspace: workspaceFor(previous, id),
        });
  }
  if (current.workspace !== previous.workspace)
    record({
      kind: "workspace-changed",
      fromWorkspace: previous.workspace,
      workspace: current.workspace,
    });
  const focus = current.workspaces[current.workspace]?.focus;
  const priorFocus = previous.workspaces[previous.workspace]?.focus;
  if (focus && focus !== priorFocus && current.tiles[focus])
    record({
      kind: "window-focused",
      app: current.tiles[focus].app,
      workspace: current.workspace,
    });
  if (current.fsVersion !== previous.fsVersion)
    record({ kind: "filesystem-updated" });
}

/** Mount once at the desktop root. Ref-counting avoids duplicate observers. */
export function startActivityTracking(source: Source): () => void {
  let subscription = subscriptions.get(source);
  if (subscription) subscription.count++;
  else {
    const initial = source.getState();
    if (initial.ready && !activityStore.getSnapshot().events.length)
      activityStore.record({
        kind: "desktop-ready",
        count: Object.keys(initial.tiles).length,
      });
    subscription = {
      count: 1,
      stop: source.subscribe((current, previous) =>
        desktopActivityChanges(current, previous),
      ),
    };
    subscriptions.set(source, subscription);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const active = subscriptions.get(source);
    if (active && --active.count === 0) {
      active.stop();
      subscriptions.delete(source);
    }
  };
}
