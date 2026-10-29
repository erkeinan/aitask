// IndexedDB stores this device's last signed-in snapshot and new captures only.
// Explicit sign-out deletes both. The service worker never caches account APIs.
let opening;
function db(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('woven-device',1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=null;reject(r.error);};});}
async function access(mode,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('data',mode),store=tx.objectStore('data');let value;fn(store,v=>value=v);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);});}
export const deviceGet=key=>access('readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});
export const deviceSet=(key,value)=>access('readwrite',s=>s.put(value,key));
export const clearDevice=()=>access('readwrite',s=>s.clear());
export async function queueCapture(text,kind){const item={id:crypto.randomUUID(),text,kind,deferSegmentation:true,at:new Date().toISOString()};await access('readwrite',s=>{const r=s.get('outbox');r.onsuccess=()=>s.put([...(r.result||[]),item],'outbox');});return item;}
export async function acknowledgeCaptures(ids){await access('readwrite',s=>{const r=s.get('outbox');r.onsuccess=()=>s.put((r.result||[]).filter(op=>!ids.includes(op.id)),'outbox');});}
export function withQueued(state,queue){const next=structuredClone(state);for(const op of queue){if(next.groups.some(g=>g.id===op.id)||next.notes.some(n=>n.id===op.id))continue;const common={id:op.id,createdAt:op.at,offlinePending:true,space:'',category:'Inbox',needsSegmentation:true};if(op.kind==='task')next.groups.push({...common,title:op.text.split('\n')[0].slice(0,160),sources:[op.text],steps:[{id:op.id+'-step',title:op.text,done:false}]});else next.notes.push({...common,text:op.text});}return next;}
