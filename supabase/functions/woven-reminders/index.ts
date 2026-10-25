import webpush from 'npm:web-push@3.6.7';
import {timingSafeEqual} from 'node:crypto';
import {dueReminders} from './reminders.mjs';
const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rest(path:string,options:RequestInit={}){return fetch(base+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});}
function trusted(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);return x.length===y.length&&timingSafeEqual(x,y);}
Deno.serve(async req=>{
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  const header=req.headers.get('x-woven-scheduler')||'';if(!header)return new Response('Unauthorized',{status:401});
  try{
    const cr=await rest('woven_push_config?select=*&id=eq.1');if(!cr.ok)throw Error('config');const [config]=await cr.json();if(!config||!trusted(header,config.scheduler_secret))return new Response('Unauthorized',{status:401});
    webpush.setVapidDetails('https://woven-ai-pilot.onrender.com',config.public_key,config.private_key);
    const dr=await rest('woven_devices?select=id,user_id,subscription'),sr=await rest('woven_state?select=user_id,payload');if(!dr.ok||!sr.ok)throw Error('data');const devices=await dr.json(),states=await sr.json();let sent=0,failed=0;
    for(const row of states){for(const event of dueReminders(row.payload)){for(const device of devices.filter((d:any)=>d.user_id===row.user_id)){
      const id=device.id+':'+event.key;
      const claim=await rest('woven_deliveries',{method:'POST',body:JSON.stringify({id,device_id:device.id})});if(claim.status===409)continue;if(!claim.ok){failed++;continue;}
      try{await webpush.sendNotification(device.subscription,JSON.stringify(event),{TTL:900,timeout:10000,urgency:'high'});sent++;}
      catch(e:any){failed++;if(e.statusCode===404||e.statusCode===410)await rest('woven_devices?id=eq.'+device.id,{method:'DELETE'});else await rest('woven_deliveries?id=eq.'+encodeURIComponent(id),{method:'DELETE'});}
    }}}
    await rest('woven_deliveries?created_at=lt.'+encodeURIComponent(new Date(Date.now()-30*86400000).toISOString()),{method:'DELETE'});
    return Response.json({ok:true,sent,failed});
  }catch{console.error('Woven reminder dispatch failed');return Response.json({ok:false},{status:503});}
});
