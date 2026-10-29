import {randomBytes} from 'node:crypto';
import {sessionCodec} from './session-cookie.mjs';

const failure=(status,message)=>Object.assign(new Error(message),{status});
export function cloudConfig(env=process.env){
  const enabled=env.WOVEN_STORAGE==='supabase';
  if(!enabled){
    if(env.RENDER||env.NODE_ENV==='production')throw Error('Hosted Woven requires WOVEN_STORAGE=supabase.');
    return null;
  }
  for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','WOVEN_OWNER_ID'])if(!env[key])throw Error('Missing '+key);
  const url=new URL(env.SUPABASE_URL);
  if(url.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS.');
  if(!env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'))throw Error('Use a Supabase publishable key, never a secret key.');
  if(!/^[0-9a-f-]{36}$/i.test(env.WOVEN_OWNER_ID))throw Error('Invalid WOVEN_OWNER_ID.');
  return {url:url.origin,key:env.SUPABASE_PUBLISHABLE_KEY,owner:env.WOVEN_OWNER_ID};
}

export function createCloud(config,{fetcher=fetch,secure=true,now=Date.now,sessionSecret=process.env.WOVEN_SESSION_SECRET||randomBytes(32).toString('hex')}={}){
  const sessions=new Map(),revoked=new Set();
  const codec=sessionCodec(sessionSecret),lifetime=30*86400000;
  const saveCookie=(res,id,s)=>{if(res)setCookie(res,codec.seal({id,...s,refreshing:undefined}),lifetime/1000);};
  let attempts=[];
  const cookieName=secure?'__Host-woven-session':'woven-session';
  async function request(path,{access,method='GET',data,bytes,headers={}}={}){
    let response;
    try{response=await fetcher(config.url+path,{method,headers:{apikey:config.key,...(access?{Authorization:'Bearer '+access}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:bytes??(data?JSON.stringify(data):undefined),signal:AbortSignal.timeout(20000)});}
    catch{throw failure(502,'Could not reach your saved data. Please try again.');}
    return response;
  }
  function setCookie(res,id,maxAge=2592000){res.setHeader('Set-Cookie',`${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`);}
  function sessionId(req){return String(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
  async function login(input,res){
    attempts=attempts.filter(t=>t>now()-600000);
    if(attempts.length>=10)throw failure(429,'Too many login attempts. Wait ten minutes and try again.');
    attempts.push(now());
    if(typeof input.email!=='string'||typeof input.password!=='string'||input.email.length>320||input.password.length>1024)throw failure(400,'Enter your email and password.');
    const r=await request('/auth/v1/token?grant_type=password',{method:'POST',data:{email:input.email.trim(),password:input.password}});
    if(!r.ok)throw failure(r.status===429?429:401,r.status===429?'Too many login attempts. Please wait and try again.':'Could not sign in. Check your email and password.');
    const value=await r.json();
    if(value.user?.id!==config.owner)throw failure(403,'This pilot is only available to its owner.');
    const old=codec.open(sessionId({headers:{cookie:res.req?.headers.cookie}})||'');if(old)sessions.delete(old.id);
    for(const [id,s] of sessions)if(s.until<now())sessions.delete(id);
    if(sessions.size>=20)sessions.delete(sessions.keys().next().value);
    const id=randomBytes(32).toString('hex');
    const s={access:value.access_token,refresh:value.refresh_token,expires:now()+value.expires_in*1000,until:now()+lifetime,csrf:randomBytes(32).toString('hex')};sessions.set(id,s);
    saveCookie(res,id,s);
  }
  async function authenticate(req,res){
    const encoded=sessionId(req),decoded=codec.open(encoded||''),id=decoded?.id;
    let session=sessions.get(id);
    if(!session&&!revoked.has(id)&&decoded?.access&&decoded?.refresh&&decoded?.csrf){session=decoded;sessions.set(id,session);}
    if(!session||session.until<now()){sessions.delete(id);throw failure(401,'Please sign in to Woven.');}
    if(session.expires<now()+60000){
      session.refreshing??=(async()=>{
        const r=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',data:{refresh_token:session.refresh}});
        if(!r.ok){if(r.status===400||r.status===401||r.status===403){sessions.delete(id);throw failure(401,'Your session expired. Please sign in again.');}throw failure(502,'Could not renew your login. Please try again.');}
        const value=await r.json();
        if(value.user?.id!==config.owner){sessions.delete(id);throw failure(403,'This pilot is only available to its owner.');}
        session.access=value.access_token;session.refresh=value.refresh_token;session.expires=now()+value.expires_in*1000;
      })().finally(()=>{delete session.refreshing;});
      await session.refreshing;
    }
    const r=await request('/auth/v1/user',{access:session.access});
    if(!r.ok){if(r.status===401||r.status===403){sessions.delete(id);throw failure(401,'Please sign in again.');}throw failure(502,'Could not verify your login. Please try again.');}
    if((await r.json()).id!==config.owner){sessions.delete(id);throw failure(403,'This pilot is only available to its owner.');}
    session.until=now()+lifetime;saveCookie(res,id,session);
    return {...session,userId:config.owner};
  }
  async function logout(req,res){
    const decoded=codec.open(sessionId(req)||''),id=decoded?.id,s=sessions.get(id)||decoded;sessions.delete(id);revoked.add(id);setCookie(res,'',0);
    if(s)await request('/auth/v1/logout?scope=local',{method:'POST',access:s.access}).catch(()=>{});
  }
  async function load(s){
    const r=await request(`/rest/v1/woven_state?user_id=eq.${s.userId}&select=payload,version`,{access:s.access});
    if(!r.ok)throw failure(502,'Could not load your saved tasks. Please try again.');
    const rows=await r.json();
    return rows[0]||{payload:{groups:[],messages:[],undo:[],notes:[],files:[]},version:null};
  }
  async function save(s,next,version){
    const inserting=version===null;
    const r=await request('/rest/v1/woven_state'+(inserting?'':`?user_id=eq.${s.userId}&version=eq.${version}`),{access:s.access,method:inserting?'POST':'PATCH',data:inserting?{user_id:s.userId,payload:next,version:1}:{payload:next,version:version+1},headers:{Prefer:'return=representation'}});
    if(r.status===409)throw failure(409,'Your tasks changed in another session. Reload before trying again.');
    if(!r.ok)throw failure(502,'Could not save your tasks. Please try again.');
    const rows=await r.json();
    if(rows.length!==1)throw failure(409,'Your tasks changed in another session. Reload before trying again.');
    return rows[0].version;
  }
  const objectPath=(s,id)=>{
    if(!/^[0-9a-f-]{36}$/i.test(id))throw failure(400,'Invalid file identifier.');
    return '/storage/v1/object/woven-files/'+s.userId+'/'+id;
  };
  async function upload(s,id,bytes){const r=await request(objectPath(s,id),{access:s.access,method:'POST',bytes,headers:{'Content-Type':'application/octet-stream','x-upsert':'false'}});if(!r.ok)throw failure(502,'Could not save your file. Please try again.');}
  async function download(s,id){const r=await request(objectPath(s,id),{access:s.access});if(!r.ok)throw failure(502,'Could not load your file. Please try again.');return Buffer.from(await r.arrayBuffer());}
  async function remove(s,id){objectPath(s,id);const r=await request('/storage/v1/object/woven-files',{access:s.access,method:'DELETE',data:{prefixes:[s.userId+'/'+id]}});if(!r.ok)throw failure(502,'Could not remove the incomplete upload.');}
  async function devices(s,operation,subscription){
    let endpoint=String(operation==='subscribe'?subscription?.endpoint:subscription||'');
    if(!endpoint.startsWith('https://')||endpoint.length>4096)throw failure(400,'Invalid notification subscription.');
    const url=new URL(endpoint);if(!(url.hostname==='fcm.googleapis.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.notify.windows.com')||url.hostname==='web.push.apple.com'))throw failure(400,'Unsupported push service.');
    if(operation==='subscribe'&&(!/^[A-Za-z0-9_-]{80,100}$/.test(subscription?.keys?.p256dh)||!/^[A-Za-z0-9_-]{20,30}$/.test(subscription?.keys?.auth)))throw failure(400,'Invalid notification keys.');
    const r=await request('/rest/v1/woven_devices'+(operation==='subscribe'?'?on_conflict=user_id,endpoint':'?user_id=eq.'+s.userId+'&endpoint=eq.'+encodeURIComponent(endpoint)),{access:s.access,method:operation==='subscribe'?'POST':'DELETE',data:operation==='subscribe'?{user_id:s.userId,endpoint,subscription}:undefined,headers:operation==='subscribe'?{Prefer:'resolution=merge-duplicates'}:{}});if(!r.ok)throw failure(502,'Could not save notification preferences.');
  }
  async function aiSetting(s,value){
    const path='/rest/v1/woven_ai_settings?user_id=eq.'+s.userId;
    const reading=value===undefined,removing=value===null;
    const r=await request(reading?path+'&select=encrypted_key':removing?path:'/rest/v1/woven_ai_settings?on_conflict=user_id',{access:s.access,method:reading?'GET':removing?'DELETE':'POST',data:!reading&&!removing?{user_id:s.userId,encrypted_key:value,updated_at:new Date(now()).toISOString()}:undefined,headers:!reading&&!removing?{Prefer:'resolution=merge-duplicates'}:{}});
    if(!r.ok)throw failure(502,'Could not load or save your private AI connection. Please try again.');
    return reading?(await r.json())[0]?.encrypted_key||'':null;
  }
  return {login,authenticate,logout,load,save,upload,download,remove,devices,aiSetting};
}
