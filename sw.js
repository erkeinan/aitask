// Cache only the public connection-help page. Never cache accounts or task data.
const OFFLINE_CACHE='woven-pwa-offline-v1';
const PUBLIC_OFFLINE=['/offline.html','/offline.css'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.addAll(PUBLIC_OFFLINE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('woven-pwa-offline-')&&key!==OFFLINE_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/offline.html').then(response=>response||Response.error())));
  else if(url.pathname==='/offline.css')event.respondWith(caches.match('/offline.css').then(response=>response||fetch(request)));
});
