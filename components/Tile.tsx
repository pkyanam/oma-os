'use client';
import dynamic from 'next/dynamic';
import { Component, type CSSProperties, type ReactNode } from 'react';
import { useDesktop, type Tile as TileState } from '@/lib/state/store';
const Terminal=dynamic(()=>import('./apps/Terminal'),{ssr:false});
const Editor=dynamic(()=>import('./apps/Editor'),{ssr:false});
const Files=dynamic(()=>import('./apps/Files'),{ssr:false});
const Agent=dynamic(()=>import('./apps/Agent'),{ssr:false});
class ClientBoundary extends Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="loading-client">This client encountered an error. Close and reopen it.</div>:this.props.children;}}
export default function Tile({id,tile,style,visible,active}:{id:string;tile:TileState;style:CSSProperties;visible:boolean;active:boolean}){return <section aria-label={`${tile.title} window`} data-app={tile.app} data-tile-id={id} className={'tile '+(active?'focused':'')} style={{...style,display:visible?'block':'none'}} onPointerDownCapture={()=>useDesktop.getState().focus(id)} onFocusCapture={()=>useDesktop.getState().focus(id)}><ClientBoundary>{tile.app==='term'?<Terminal id={id} active={active}/>:tile.app==='editor'?<Editor id={id} path={tile.path??'/.oma/config.toml'} active={active}/>:tile.app==='files'?<Files/>:tile.app==='agent'?<Agent active={active}/>:null}</ClientBoundary></section>}
