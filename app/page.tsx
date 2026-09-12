'use client';
import { useEffect, useState } from 'react';
export default function Home(){const [time,setTime]=useState('');useEffect(()=>{const tick=()=>setTime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[]);return <><header><span style={{color:'var(--accent)'}}>1　<span style={{color:'var(--fg-mute)'}}>2　3　4　5　6　7　8　9</span>　 oma.os</span><span>{time}</span><span>agent offline　 ·　 tokyo-night</span></header><main>oma.os　/　assembling your desktop</main></>}
