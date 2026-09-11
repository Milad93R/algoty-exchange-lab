'use client';
import {useEffect} from 'react';

// One event per document load, including refreshes; client navigation is not a visit.
export default function VisitNotification(){
  useEffect(()=>{
    if(window.__algotyVisitSent)return;
    window.__algotyVisitSent=true;
    fetch('/api/page-view',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({page:window.location.pathname}),keepalive:true,
    }).catch(()=>{});
  },[]);
  return null;
}
