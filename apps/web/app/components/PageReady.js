'use client';
import Brand from './Brand';
import {useEffect,useState} from 'react';
export default function PageReady({children}) {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    let active=true;
    // Client-side navigation keeps this layout mounted, so the cover only runs on a cold load.
    // A repeat cold load in the same tab already has fonts and artwork cached: reveal at once.
    let seen=false;
    try{seen=sessionStorage.getItem('algoty-ready')==='1'}catch{}
    const done=()=>{try{sessionStorage.setItem('algoty-ready','1')}catch{};if(active)setReady(true)};
    if(seen){requestAnimationFrame(done);if('serviceWorker' in navigator)navigator.serviceWorker.register('/asset-sw.js').catch(()=>{});return()=>{active=false}}
    let observer;
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const fonts=Promise.allSettled(['400 16px DM','600 16px DM','700 16px DM','400 16px Hand'].map(font=>document.fonts.load(font)));
    const pictures=Promise.allSettled([...document.querySelectorAll('.landing-hero img')].map(img=>img.decode()));
    const sculpture=document.querySelector('.sculpture');
    const artwork=!sculpture||sculpture.dataset.ready?Promise.resolve():new Promise(resolve=>{
      observer=new MutationObserver(()=>{if(sculpture.dataset.ready){observer.disconnect();resolve()}});
      observer.observe(sculpture,{attributes:true,attributeFilter:['data-ready']});
    });
    const timeout=setTimeout(()=>{
      if(sculpture&&!sculpture.dataset.ready)sculpture.dataset.ready='fallback';
      done();
    },8000);
    Promise.allSettled([fonts,pictures,artwork]).then(frame).then(()=>{clearTimeout(timeout);done()});
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/asset-sw.js').catch(()=>{});
    return()=>{active=false;clearTimeout(timeout);observer?.disconnect()};
  },[]);
  return <><div className={'page-preloader'+(ready?' finished':'')} role="status" aria-live="polite" aria-label="Loading AlgoTy"><Brand className="loader-brand"/><div className="loader-track"><i/></div></div><div className="ready-content" style={{visibility:ready?'visible':'hidden'}} aria-hidden={!ready}>{children}</div></>;
}
