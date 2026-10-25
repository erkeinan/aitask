import {dueReminders} from './reminders.mjs';
import {deviceGet,deviceSet} from './offline-store.mjs';
export function createDeviceAlerts({api,getState,notice}){
  let registered=false,checking=false;
  async function enable(){
    if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('For phone alerts, install Woven from Safari on iPhone/iPad, or Chrome on Android. Desktop alerts work in Chrome and Edge.');
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Alerts are blocked. Allow notifications in your browser or device settings.');
    const {publicKey}=await api('/api/notifications/key');if(!publicKey)throw Error('Background alerts are not configured yet.');
    const registration=await navigator.serviceWorker.ready;const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});await api('/api/notifications/subscribe',{subscription:subscription.toJSON()});registered=true;notice('Alerts enabled on this device.');
  }
  async function disable(){const r=await navigator.serviceWorker?.getRegistration(),sub=await r?.pushManager.getSubscription();if(sub){await api('/api/notifications/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}registered=false;notice('Alerts disabled on this device.');}
  async function tick(){if(checking||!getState().groups?.length)return;checking=true;try{const events=dueReminders(getState()),seen=await deviceGet('reminder-seen')||{};for(const event of events){if(seen[event.key])continue;notice(event.title+' · '+event.body);if(!registered&&globalThis.Notification?.permission==='granted'){const r=await navigator.serviceWorker?.getRegistration();if(r)await r.showNotification(event.title,{body:event.body,tag:event.key,icon:'/icons/woven-192.png',data:{url:event.url}});}seen[event.key]=Date.now();}for(const key of Object.keys(seen))if(seen[key]<Date.now()-7*86400000)delete seen[key];await deviceSet('reminder-seen',seen);}catch{}finally{checking=false;}}
  async function restore(){try{registered=!!(await (await navigator.serviceWorker?.getRegistration())?.pushManager.getSubscription());}catch{}}
  restore();setInterval(tick,30000);window.addEventListener('focus',tick);return {enable,disable,tick};
}
