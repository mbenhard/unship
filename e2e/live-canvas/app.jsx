import React, {useState,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
window.demoMounts=0;window.shadowConnects=0;
customElements.define('live-badge',class extends HTMLElement {
 connectedCallback(){window.shadowConnects++;if(!this.shadowRoot)this.attachShadow({mode:'open'}).innerHTML='<style>span{display:inline-block;padding:6px 10px;border-radius:8px;background:#e0ecd7;color:#3b673c;font:12px system-ui}</style><span>Shadow DOM stays alive</span>';}
});
function Option({name,hidden}) {
 const [portal,setPortal]=useState(false);
 const [count,setCount]=useState(0),[nameValue,setName]=useState('Untitled'),[expanded,setExpanded]=useState(false);
 const canvas=useRef(null);
 useEffect(()=>{window.demoMounts++;const c=canvas.current.getContext('2d');c.fillStyle='#6d986b';c.fillRect(0,0,240,60);c.fillStyle='#fff';c.font='15px sans-serif';c.fillText('Real canvas pixels',16,36);},[]);
 return <article data-unship-option={name} hidden={hidden} className="card">
  <small>{name} · existing React component</small><h2>A little room to begin.</h2>
  <div className="actions"><button className="increment" onClick={()=>setCount(c=>c+1)}>Count {count}</button><button className="expand" onClick={()=>setExpanded(v=>!v)}>{expanded?'Less detail':'More detail'}</button></div>
  <label>Project name<input value={nameValue} onChange={event=>setName(event.target.value)}/></label>
  {expanded&&<p className="details">This content was created by React while the original component stayed mounted.</p>}
  <canvas ref={canvas} width="240" height="60"/><live-badge/>
  <iframe title={`${name} embedded widget`} style={{width:'100%',height:54,border:'1px solid #cbd7c5',borderRadius:8}} srcDoc={'<html><body style="margin:8px;font:12px system-ui"><button onclick="this.textContent=++window.count">Embedded count 0</button><script>window.count=0;parent.iframeLoads=(parent.iframeLoads||0)+1;</script></body></html>'}/>
  <button className="portal-toggle" onClick={()=>setPortal(v=>!v)}>Portal menu · known limitation</button>
  {portal&&createPortal(<div className="portal-menu" style={{position:'fixed',left:30,top:30,zIndex:2147483647,background:'white',padding:20,border:'1px solid'}}>Menu outside component</div>,document.body)}
  <div className="responsive-panel"><span className="media-status"></span><span className="container-status"></span></div>
  <div className="pulse" aria-label="CSS animation"><i/></div>
 </article>;
}
function App(){return <section data-unship-pick="Live components" data-unship-canvas="grid" className="options"><Option name="Quiet start"/><Option name="Studio journal" hidden/></section>}
createRoot(document.getElementById('react-root')).render(<App/>);
