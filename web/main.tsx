import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import './fonts.css';
import Desktop from '@/components/Desktop';
class DesktopBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="boot-error"><h1>The desktop could not open.</h1><p>Your saved files remain in this browser.</p><button onClick={()=>location.reload()}>Reload desktop</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><DesktopBoundary><Desktop/></DesktopBoundary></React.StrictMode>);
