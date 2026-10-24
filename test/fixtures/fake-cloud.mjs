// Loaded only by server integration tests. No real Supabase or AI calls.
const owner=process.env.WOVEN_OWNER_ID;
let row=null,removeAttempts=0;const files=new Map();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async (address,opts={})=>{
  const url=new URL(address);
  if(url.origin!=='https://test.supabase.co')throw Error('Unexpected external request in test');
  if(url.pathname==='/auth/v1/token'){
    const body=JSON.parse(opts.body);
    if(body.password!=='test-only-password')return json({},400);
    return json({user:{id:owner},access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
  }
  if(url.pathname==='/auth/v1/user')return json({id:owner});
  if(url.pathname==='/auth/v1/logout')return json({});
  if(opts.headers.Authorization!=='Bearer test-access')return json({},401);
  if(url.pathname==='/rest/v1/woven_state'){
    if(opts.method==='GET')return json(row?[row]:[]);
    if(opts.method==='POST'){if(row)return json({},409);row=JSON.parse(opts.body);return json([row]);}
    if(url.searchParams.get('version')!=='eq.'+row.version)return json([]);
    row={...row,...JSON.parse(opts.body)};return json([row]);
  }
  if(url.pathname==='/storage/v1/object/woven-files'&&opts.method==='DELETE'){
    if(removeAttempts++===0)return json({},503);
    for(const prefix of JSON.parse(opts.body).prefixes)files.delete('/storage/v1/object/woven-files/'+prefix);
    return json([]);
  }
  if(url.pathname.startsWith('/storage/v1/object/woven-files/')){
    if(opts.method==='POST'){files.set(url.pathname,opts.body);return json({});}
    return files.has(url.pathname)?new Response(files.get(url.pathname)):json({},404);
  }
  return json({},404);
};
