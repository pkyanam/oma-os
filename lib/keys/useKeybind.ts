'use client';
import { useEffect } from 'react';
import { useDesktop } from '@/lib/state/store';
import { oma } from '@/lib/oma/bus';
import { fs } from '@/lib/fs/opfs';
import type { Direction } from '@/lib/layout/tree';
export async function dismissWelcome(){try{await fs.write('/.oma/seen-welcome','seen\n');useDesktop.getState().setOverlay(null);}catch{useDesktop.getState().notify('Could not save welcome preference');}}
export function useKeybind(){useEffect(()=>{const handle=(e:KeyboardEvent)=>{const s=useDesktop.getState();const bus=(argv:string[])=>{void oma(argv,{store:useDesktop,fs});};const code=e.code,key=e.key.toLowerCase();const dir:Record<string,Direction>={KeyH:'left',KeyJ:'down',KeyK:'up',KeyL:'right',ArrowLeft:'left',ArrowDown:'down',ArrowUp:'up',ArrowRight:'right'};
 const table:[boolean,()=>void][]=[
 [key==='escape'&&!!s.overlay,()=>{if(s.overlay==='welcome')void dismissWelcome();else s.setOverlay(null);}],
 [key==='enter'&&s.overlay==='welcome',()=>{void dismissWelcome();}],
 [(e.altKey||e.ctrlKey)&&code==='Space',()=>s.setOverlay(e.shiftKey?'menu':'launcher')],
 [e.altKey&&code==='KeyK'&&!e.shiftKey,()=>s.setOverlay('keys')],
 [e.altKey&&/^Digit[1-9]$/.test(code),()=>{const n=Number(code.slice(-1));if(e.shiftKey)s.moveToWs(n);else bus(['ws',String(n)]);}],
 [e.altKey&&code==='Enter',()=>bus(['launch','term'])],
 [e.altKey&&code==='KeyW',()=>bus(['close'])],
 [e.altKey&&!!dir[code],()=>bus([e.shiftKey?'swap':'focus',dir[code]])],
 [e.altKey&&code==='KeyF',()=>s.toggleFullscreen()],
 [e.altKey&&code==='KeyA',()=>bus(['launch','agent'])],
 [e.altKey&&code==='KeyE',()=>bus(['launch','editor'])],
 [e.altKey&&code==='KeyT',()=>s.notify('Tokyo Night is the only theme in v1')],
 [e.altKey&&(code==='Equal'||code==='Minus'),()=>s.grow(code==='Equal'?.05:-.05)]
 ];const match=table.find(([test])=>test);if(match){e.preventDefault();e.stopPropagation();match[1]();}};window.addEventListener('keydown',handle,true);return()=>window.removeEventListener('keydown',handle,true);},[]);}
