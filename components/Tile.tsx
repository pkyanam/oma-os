"use client";
import dynamic from "next/dynamic";
import { Component, type CSSProperties, type ReactNode } from "react";
import { useDesktop, type Tile as TileState } from "@/lib/state/store";
const Terminal = dynamic(() => import("./apps/Terminal"), { ssr: false });
const Editor = dynamic(() => import("./apps/Editor"), { ssr: false });
const Files = dynamic(() => import("./apps/Files"), { ssr: false });
const Browser = dynamic(() => import("./apps/Browser"), { ssr: false });
const Agent = dynamic(() => import("./apps/Agent"), { ssr: false });
const Notes = dynamic(() => import('./apps/Notes'), { ssr: false });
const Canvas = dynamic(() => import('./apps/Canvas'), { ssr: false });
const Lab = dynamic(() => import('./apps/Lab'), { ssr: false });
const Data = dynamic(() => import('./apps/Data'), { ssr: false });
const Media = dynamic(() => import('./apps/Media'), { ssr: false });
const Tasks = dynamic(() => import('./apps/Tasks'), { ssr: false });
const Settings = dynamic(() => import('./apps/Settings'), { ssr: false });
const Applications = dynamic(() => import('./apps/Applications'), { ssr: false });
const Draw = dynamic(() => import('./apps/Draw'), { ssr: false });
const Database = dynamic(() => import('./apps/Database'), { ssr: false });
const Activity = dynamic(() => import('./apps/Activity'), { ssr: false });
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
      <div className="loading-client">
        This client encountered an error. Close and reopen it.
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
      <ClientBoundary>
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
      </ClientBoundary>
    </section>
  );
}
