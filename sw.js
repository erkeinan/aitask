const OFFLINE_CACHE='woven-pwa-offline-v4';
const SHELL=['/','/app.js','/pwa.mjs','/offline-store.mjs','/capture-sync.mjs','/device-alerts.mjs','/reminders.mjs','/knowledge-ui.mjs','/ai-page.mjs','/voice-turn.mjs','/voice-preferences.mjs','/threads.mjs','/task-model.mjs','/task-intelligence.mjs','/productivity.mjs','/celebration.mjs','/network.mjs','/style.css','/chat.css','/inbox.css','/records.css','/compact.css','/messaging.css','/icons/woven-192.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('woven-pwa-offline-')&&key!==OFFLINE_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/').then(response=>response||Response.error())));
  else if(SHELL.includes(url.pathname))event.respondWith(fetch(request).catch(()=>caches.match(url.pathname).then(response=>response||Response.error())));
});
self.addEventListener('push',event=>{event.waitUntil((async()=>{let data;try{data=event.data?.json();}catch{}if(!data)return;await self.registration.showNotification(data.title||'Woven reminder',{body:data.body||'A task is due soon.',icon:'/icons/woven-192.png',badge:'/icons/woven-192.png',tag:data.key,data:{url:data.url||'/'}});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();const relative=event.notification.data?.url||'/',url=new URL(relative,self.location.origin);if(url.origin!==self.location.origin)return;event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){await client.navigate(url.href);return client.focus();}return self.clients.openWindow(url.href);})());});
