'use client';
import { useEffect, useState } from 'react';
import { Command, TerminalSquare, Search, X } from 'lucide-react';
import Bar from './Bar';
import Tile from './Tile';
import Split from './Split';
import Overlays from './Overlays';
import { useDesktop } from '@/lib/state/store';
import { geometry, type Rect } from '@/lib/layout/tree';
import { seed } from '@/lib/fs/seed';
import { fs,errorMessage } from '@/lib/fs/opfs';
import { useKeybind } from '@/lib/keys/useKeybind';
import { oma } from '@/lib/oma/bus';
function style(r:Rect){const l=r.x>0?4:0,t=r.y>0?4:0,right=r.x+r.w<.99999?4:0,bottom=r.y+r.h<.99999?4:0;return {left:`calc(${r.x*100}% + ${l}px)`,top:`calc(${r.y*100}% + ${t}px)`,width:`calc(${r.w*100}% - ${l+right}px)`,height:`calc(${r.h*100}% - ${t+bottom}px)`};}
export default function Desktop(){const s=useDesktop(),[bootError,setBootError]=useState('');useKeybind();useEffect(()=>{let live=true;void(async()=>{try{await useDesktop.persist.rehydrate();await seed();const seen=await fs.exists('/.oma/seen-welcome');if(!live)return;useDesktop.getState().boot();if(!seen)useDesktop.getState().setOverlay('welcome');}catch(e){if(live){setBootError(errorMessage(e));useDesktop.getState().boot();}}})();return()=>{live=false;};},[]);useEffect(()=>{if(!s.notice)return;const timer=setTimeout(()=>useDesktop.getState().notify(null),4500);return()=>clearTimeout(timer);},[s.notice]);
 const positions=new Map<string,Rect&{workspace:number}>();Object.entries(s.workspaces).forEach(([n,w])=>geometry(w.layout).forEach(r=>positions.set(r.id,{...r,workspace:Number(n)})));const ws=s.workspaces[s.workspace];
 return <div className="os-shell"><Bar/><main className="desktop" aria-label="Desktop"><div className="workspace-area" data-workspace={s.workspace}>{s.ready?Object.entries(s.tiles).map(([id,tile])=>{const r=positions.get(id);if(!r)return null;const visible=r.workspace===s.workspace&&(!s.fullscreen||s.fullscreen===id);return <Tile key={id} id={id} tile={tile} visible={visible} active={visible&&ws.focus===id&&!s.overlay} style={s.fullscreen===id?{inset:0,width:'100%',height:'100%'}:style(r)}/>;}):<div className="boot-state"><Command size={20}/><span>Opening your workspace…</span></div>}{s.ready&&!ws.layout&&<div className="empty-workspace" key={s.workspace}><div className="empty-number">{String(s.workspace).padStart(2,'0')}</div><p>Room to think.</p><div><button onClick={()=>void oma(['launch','term'],{store:useDesktop,fs})}><TerminalSquare size={14}/>Terminal <kbd>Alt+Enter</kbd></button><button onClick={()=>s.setOverlay('launcher')}><Search size={14}/>Launcher <kbd>Alt+Space</kbd></button></div></div>}{s.ready&&ws.layout&&!s.fullscreen&&<Split node={ws.layout}/>}</div></main>{bootError&&<div className="boot-error">{bootError}</div>}<Overlays/>{s.notice&&<div className="notification" role="status"><span>{s.notice}</span><button aria-label="Dismiss notification" onClick={()=>s.notify(null)}><X size={13}/></button></div>}</div>;
}
