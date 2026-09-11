/* Only immutable artwork/font vendor assets. Never cache pages, APIs or trading data. */
const CACHE='algoty-brand-v3';
const ASSETS=['font-0.ttf','font-2.ttf','font-3.ttf','font-4.ttf','orbit.svg','three.min.js'].map(name=>'/brand/'+name);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.allSettled(ASSETS.map(async path=>{const r=await fetch(path,{signal:AbortSignal.timeout(8000)});if(r.ok)await cache.put(path,r)}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('algoty-brand-')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search||!ASSETS.includes(url.pathname))return;
 event.respondWith((async()=>{
 const cache=await caches.open(CACHE);const hit=await cache.match(url.pathname);if(hit)return hit;
 const r=await fetch(event.request);if(r.ok)await cache.put(url.pathname,r.clone());return r;
 })());
});
