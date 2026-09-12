"use client";
import { Component, Suspense, lazy, type CSSProperties, type ReactNode } from "react";
import { useDesktop, type Tile as TileState } from "@/lib/state/store";
const Terminal = lazy(() => import("./apps/Terminal"));
const Editor = lazy(() => import("./apps/Editor"));
const Files = lazy(() => import("./apps/Files"));
const Browser = lazy(() => import("./apps/Browser"));
const Agent = lazy(() => import("./apps/Agent"));
const Notes = lazy(() => import('./apps/Notes'));
const Canvas = lazy(() => import('./apps/Canvas'));
const Lab = lazy(() => import('./apps/Lab'));
const Data = lazy(() => import('./apps/Data'));
const Media = lazy(() => import('./apps/Media'));
const Tasks = lazy(() => import('./apps/Tasks'));
const Settings = lazy(() => import('./apps/Settings'));
const Applications = lazy(() => import('./apps/Applications'));
const Draw = lazy(() => import('./apps/Draw'));
const Database = lazy(() => import('./apps/Database'));
const Activity = lazy(() => import('./apps/Activity'));
class ClientBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="loading-client" role="alert">
        This app encountered an error. Reconnect if offline, save your work in other apps, then reload the desktop.
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function Tile({
  id,
  tile,
  style,
  visible,
  active,
  mobileActive,
}: {
  id: string;
  tile: TileState;
  style: CSSProperties;
  visible: boolean;
  active: boolean;
  mobileActive: boolean;
}) {
  return (
    <section
      aria-label={`${tile.title} window`}
      data-app={tile.app}
      data-mobile-active={mobileActive}
      data-tile-id={id}
      className={"tile " + (active ? "focused" : "")}
      style={{ ...style, display: visible ? "block" : "none" }}
      onPointerDownCapture={() => useDesktop.getState().focus(id)}
      onFocusCapture={() => useDesktop.getState().focus(id)}
    >
      <ClientBoundary><Suspense fallback={<div className="loading-client">Opening…</div>}>
        {tile.app === "term" ? (
          <Terminal id={id} active={active} />
        ) : tile.app === "editor" ? (
          <Editor
            id={id}
            path={tile.path ?? "/.oma/config.toml"}
            active={active}
          />
        ) : tile.app === "files" ? (
          <Files active={active} path={tile.path} />
        ) : tile.app === "agent" ? (
          <Agent active={active} />
        ) : tile.app === "browser" ? (
          <Browser id={id} path={tile.path} active={active} />
        ) : tile.app === 'notes' ? (
          <Notes id={id} path={tile.path} active={active}/>
        ) : tile.app === 'canvas' ? (
          <Canvas id={id} path={tile.path} active={active}/>
        ) : tile.app === 'lab' ? (
          <Lab id={id} path={tile.path} active={active}/>
        ) : tile.app === 'data' ? (
          <Data id={id} path={tile.path} active={active}/>
        ) : tile.app === 'media' ? (
          <Media path={tile.path} active={active}/>
        ) : tile.app === 'tasks' ? (
          <Tasks id={id} path={tile.path} active={active}/>
        ) : tile.app === 'settings' ? (
          <Settings/>
        ) : tile.app === 'apps' ? (
          <Applications active={active}/>
        ) : tile.app === 'draw' ? (
          <Draw id={id} active={active} path={tile.path}/>
        ) : tile.app === 'database' ? (
          <Database id={id} active={active} path={tile.path}/>
        ) : tile.app === 'activity' ? (
          <Activity/>
        ) : null}
      </Suspense></ClientBoundary>
    </section>
  );
}
