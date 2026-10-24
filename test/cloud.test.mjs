import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudConfig,createCloud} from '../cloud.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const config={url:'https://example.supabase.co',key:'sb_publishable_test',owner};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const credentials={email:'owner@example.test',password:'test-only-password'};
function harness(handler,{secure=true,now}={}){
  let cookie='';const calls=[];
  const cloud=createCloud(config,{secure,now,fetcher:async(url,opts)=>{calls.push({url,opts});return handler(url,opts);}});
  const res={setHeader:(key,value)=>{assert.equal(key,'Set-Cookie');cookie=value;}};
  return {cloud,calls,res,req:()=>({headers:{cookie:cookie.split(';')[0]}}),cookie:()=>cookie};
}
const token=(user=owner)=>json({user:{id:user},access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});

test('hosted apps cannot fall back to unprotected local mode',()=>{
  assert.throws(()=>cloudConfig({RENDER:'true'}),/requires/);
  assert.throws(()=>cloudConfig({NODE_ENV:'production'}),/requires/);
  assert.equal(cloudConfig({}),null);
  assert.throws(()=>cloudConfig({WOVEN_STORAGE:'supabase'}),/Missing/);
  assert.throws(()=>cloudConfig({WOVEN_STORAGE:'supabase',SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:'service_role',WOVEN_OWNER_ID:owner}),/publishable/);
});
test('login accepts only the owner; cookies contain no provider tokens',async()=>{
  const h=harness((url)=>url.includes('/token?')?token():json({id:owner}));
  await assert.rejects(h.cloud.authenticate({headers:{}}),{status:401});
  await h.cloud.login(credentials,h.res);
  assert.match(h.cookie(),/^__Host-woven-session=/);assert.match(h.cookie(),/HttpOnly/);assert.match(h.cookie(),/SameSite=Strict/);assert.match(h.cookie(),/Secure/);
  assert.doesNotMatch(h.cookie(),/test-access|test-refresh/);
  const s=await h.cloud.authenticate(h.req());assert.equal(s.userId,owner);assert.ok(s.csrf);
  const other=harness(()=>token('22222222-2222-4222-8222-222222222222'));
  await assert.rejects(other.cloud.login(credentials,other.res),{status:403});assert.equal(other.cookie(),'');
  await h.cloud.logout(h.req(),h.res);assert.match(h.cookie(),/Max-Age=0/);
  await assert.rejects(h.cloud.authenticate(h.req()),{status:401});
});
test('expired access tokens refresh once for simultaneous requests; revoked users fail',async()=>{
  let clock=0,refreshes=0,revoked=false;
  const h=harness((url)=>{
    if(url.includes('grant_type=refresh_token')){refreshes++;return token();}
    if(url.includes('/token?'))return token();
    return revoked?json({},401):json({id:owner});
  },{now:()=>clock});
  await h.cloud.login(credentials,h.res);clock=3550000;
  await Promise.all([h.cloud.authenticate(h.req()),h.cloud.authenticate(h.req())]);assert.equal(refreshes,1);
  revoked=true;await assert.rejects(h.cloud.authenticate(h.req()),{status:401});
});
test('login throttling limits repeated attempts',async()=>{
  const h=harness(()=>json({},400));
  for(let i=0;i<10;i++)await assert.rejects(h.cloud.login(credentials,h.res),{status:401});
  await assert.rejects(h.cloud.login(credentials,h.res),{status:429});assert.equal(h.calls.length,10);
});
test('state saves use the user JWT and reject concurrent overwrites',async()=>{
  let row=null;
  const h=harness((url,opts)=>{
    assert.equal(opts.headers.apikey,config.key);assert.equal(opts.headers.Authorization,'Bearer test-access');
    if(opts.method==='GET')return json(row?[row]:[]);
    if(opts.method==='POST'){
      if(row)return json({},409);row=JSON.parse(opts.body);return json([row]);
    }
    if(url.includes('version=eq.'+row.version)){row={...row,...JSON.parse(opts.body)};return json([row]);}
    return json([]);
  });
  const s={userId:owner,access:'test-access'};
  const empty=await h.cloud.load(s);assert.equal(empty.version,null);assert.equal(empty.payload.groups.length,0);
  assert.equal(await h.cloud.save(s,empty.payload,null),1);
  await assert.rejects(h.cloud.save(s,empty.payload,null),{status:409});
  assert.equal(await h.cloud.save(s,{...empty.payload,notes:[{text:'saved'}]},1),2);
  await assert.rejects(h.cloud.save(s,empty.payload,1),{status:409});
  assert.equal((await h.cloud.load(s)).payload.notes[0].text,'saved');
});
test('storage is scoped to user paths and uses the documented deletion API',async()=>{
  const id='33333333-3333-4333-8333-333333333333',s={userId:owner,access:'test-access'};
  const h=harness((url,opts)=>{
    assert.equal(opts.headers.Authorization,'Bearer test-access');
    if(opts.method==='DELETE'){assert.equal(url,config.url+'/storage/v1/object/woven-files');assert.deepEqual(JSON.parse(opts.body),{prefixes:[owner+'/'+id]});return json([]);}
    assert.equal(url,config.url+'/storage/v1/object/woven-files/'+owner+'/'+id);
    if(opts.method==='POST'){assert.equal(opts.headers['x-upsert'],'false');return json({});}
    return new Response('document');
  });
  await h.cloud.upload(s,id,Buffer.from('document'));
  assert.equal((await h.cloud.download(s,id)).toString(),'document');await h.cloud.remove(s,id);
  await assert.rejects(h.cloud.download(s,'../private'),{status:400});
});
