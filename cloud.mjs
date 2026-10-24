import {randomBytes} from 'node:crypto';

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

export function createCloud(config,{fetcher=fetch,secure=true,now=Date.now}={}){
  const sessions=new Map();
  let attempts=[];
  const cookieName=secure?'__Host-woven-session':'woven-session';
  async function request(path,{access,method='GET',data,bytes,headers={}}={}){
    let response;
    try{response=await fetcher(config.url+path,{method,headers:{apikey:config.key,...(access?{Authorization:'Bearer '+access}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:bytes??(data?JSON.stringify(data):undefined),signal:AbortSignal.timeout(20000)});}
    catch{throw failure(502,'Could not reach your saved data. Please try again.');}
    return response;
  }
  function setCookie(res,id,maxAge=43200){res.setHeader('Set-Cookie',`${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`);}
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
    const old=sessionId({headers:{cookie:res.req?.headers.cookie}});if(old)sessions.delete(old);
    for(const [id,s] of sessions)if(s.until<now())sessions.delete(id);
    if(sessions.size>=20)sessions.delete(sessions.keys().next().value);
    const id=randomBytes(32).toString('hex');
    sessions.set(id,{access:value.access_token,refresh:value.refresh_token,expires:now()+value.expires_in*1000,until:now()+43200000,csrf:randomBytes(32).toString('hex')});
    setCookie(res,id);
  }
  async function authenticate(req){
    const id=sessionId(req),session=sessions.get(id);
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
    return {...session,userId:config.owner};
  }
  async function logout(req,res){
    const id=sessionId(req),s=sessions.get(id);sessions.delete(id);setCookie(res,'',0);
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
  return {login,authenticate,logout,load,save,upload,download,remove};
}
