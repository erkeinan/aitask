import http from 'node:http';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {memoryView,queueLearning,changeMemory,learningRequest,applyLearning,failLearning} from './memory.mjs';
import {applyMemoryActions} from './memory-chat.mjs';
import {buildRequest,validateReply,applyActions,initialState} from './assistant.mjs';
import {addNote,completeTask,completeGroup,setTaskDate,validateUpload,archiveRecord,deleteRecord,changeChecklist,setRelations,saveActionLink,editRecordText,addRecordUpdate,setRecurrence,advanceRecurring} from './records.mjs';
import {detectRecurrence,validateRecurrence} from './productivity.mjs';
import {cloudConfig,createCloud} from './cloud.mjs';
import {captureReceivable,receivableFact,currencyCode} from './capture.mjs';
import {validateThread,threadMessages,threadInfo} from './threads.mjs';
import {inspectFile,suggestFiling,filingRequest,validFilingReply,filingRecords} from './file-intelligence.mjs';
import {assistantSession,assistantHistory} from './ai-session.mjs';
import {voiceGreeting} from './voice-preferences.mjs';
import {transcriptionForm,transcriptNeedsReview} from './voice.mjs';
import {normalizeCaptureActions,financialCreationReview,classifyRecord} from './segmentation.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const config=cloudConfig();
const dataDir=process.env.WOVEN_DATA_DIR||join(root,'data');
let localState;
const fileDir=join(dataDir,'files');
if(!config){
await mkdir(fileDir,{recursive:true});
try{localState=JSON.parse(await readFile(join(dataDir,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Cannot read saved tasks. Existing data has been preserved.');localState=initialState();}
localState.notes??=[];localState.files??=[];
}
function appendAssistant(next,text,actions=[],threadId='inbox'){next.messages=[...next.messages,{id:randomUUID(),role:'assistant',text,question:null,actions,thread_id:threadId,at:new Date().toISOString()}].slice(-200);return next;}
const greetingAudio=new Map();
let apiKey=process.env.OPENAI_API_KEY||'',busy=false;
const model=process.env.OPENAI_MODEL||'gpt-4.1';
const token=randomBytes(32).toString('hex');
const port=Number(process.env.PORT||4317);
const origin=new URL(process.env.WOVEN_APP_URL||process.env.RENDER_EXTERNAL_URL||`http://127.0.0.1:${port}`).origin;
const secure=origin.startsWith('https:');
if(config&&!secure&&new URL(origin).hostname!=='127.0.0.1')throw Error('Cloud Woven requires an HTTPS app URL.');
if(!config&&origin!==`http://127.0.0.1:${port}`)throw Error('Local mode must use the local app address.');
const cloud=config?createCloud(config,{secure}):null;
const safeState=state=>({...state,memory:memoryView(state),knowledge:undefined,messages:state.messages.map(m=>({...m,image:undefined,hasImage:!!m.image}))});
let learningTimer,learningRunning=false;
const writeState=async(session,next,version)=>{
  if(cloud)return cloud.save(session,next,version);
  await writeFile(join(dataDir,'state.tmp'),JSON.stringify(next,null,2));await rename(join(dataDir,'state.tmp'),join(dataDir,'state.json'));localState=next;
};
function scheduleLearning(cookie=''){
  if(learningTimer||learningRunning||!apiKey)return;
  learningTimer=setTimeout(()=>{learningTimer=null;void runLearning(cookie);},350);learningTimer.unref();
}
async function runLearning(cookie){
  if(learningRunning)return;if(busy){scheduleLearning(cookie);return;}
  learningRunning=true;let session,snapshot,job,version,result,failed=false;
  try{
    busy=true;
    try{
      session=cloud?await cloud.authenticate({headers:{cookie}}):null;
      const saved=cloud?await cloud.load(session):{payload:localState,version:null};
      snapshot=queueLearning(saved.payload);version=saved.version;
      if(JSON.stringify(snapshot)!==JSON.stringify(saved.payload))version=await writeState(session,snapshot,version);
      job=snapshot.memory.enabled&&snapshot.memory.jobs.find(j=>j.status==='queued');
    }finally{busy=false;}
    if(!job||!apiKey)return;
    try{
      const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(learningRequest(snapshot,job,model)),signal:AbortSignal.timeout(25000)});
      if(!upstream.ok)throw Error('Learning unavailable');const output=await upstream.json();if(output.status!=='completed')throw Error('Incomplete learning');
      result=JSON.parse((output.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')).facts;
    }catch{failed=true;}
    // Fetching does not lock normal task/chat saves. Re-read before applying facts.
    const commit=async()=>{
      while(busy)await new Promise(resolve=>{const timer=setTimeout(resolve,100);timer.unref();});
      busy=true;
      try{
        if(cloud)session=await cloud.authenticate({headers:{cookie}});
        const saved=cloud?await cloud.load(session):{payload:localState,version:null};
        let next;
        try{next=failed?failLearning(saved.payload,job.id):applyLearning(saved.payload,job.id,result);}catch{next=failLearning(saved.payload,job.id);}
        await writeState(session,queueLearning(next),saved.version);
      }catch{/* Keep persisted jobs for a later request or explicit retry. */}
      finally{busy=false;learningRunning=false;scheduleLearning(cookie);}
    };
    await commit();
  }catch{/* Existing tasks are preserved if cloud storage or login is unavailable. */}
  finally{if(!job){learningRunning=false;}else if(!busy&&learningRunning){learningRunning=false;scheduleLearning(cookie);}}
}
function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req){let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>15*1024*1024)throw Object.assign(new Error('Please use an image smaller than 10 MB.'),{status:413});parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw Object.assign(new Error('Invalid request.'),{status:400});}}
function apiError(status){return ({401:'That API key was not accepted. Check the key and try again.',403:'This API key does not have permission for this request.',404:'The selected model is not available to this API project.',429:'OpenAI reported a usage or rate limit. Check your API billing and limits, then try again.'})[status]||'OpenAI could not complete the request. Please try again.';}
const server=http.createServer(async(req,res)=>{
try{
if(req.headers.host!==new URL(origin).host)return json(res,403,{error:'Use the configured app address.'});
const url=new URL(req.url,origin);
if(req.method==='GET'&&url.pathname==='/healthz')return json(res,200,{ok:true});
const pwaAssets={'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/sw.js':['sw.js','text/javascript; charset=utf-8'],'/offline.html':['offline.html','text/html; charset=utf-8'],'/offline.css':['offline.css','text/css; charset=utf-8'],'/icons/woven-180.png':['icons/woven-180.png','image/png'],'/icons/woven-192.png':['icons/woven-192.png','image/png'],'/icons/woven-512.png':['icons/woven-512.png','image/png']};
if(req.method==='GET'&&pwaAssets[url.pathname]){const [file,mime]=pwaAssets[url.pathname];res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',...(url.pathname==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})});return res.end(await readFile(join(root,file)));}
if(req.method==='GET'&&/^\/vendor\/pdfjs\/(?:pdf(?:\.worker)?\.mjs|LICENSE|(?:cmaps|standard_fonts|wasm|iccs)\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.test(url.pathname)){
const bytes=await readFile(join(root,url.pathname.slice(1)));res.writeHead(200,{'Content-Type':url.pathname.endsWith('.mjs')?'text/javascript; charset=utf-8':url.pathname.endsWith('.wasm')?'application/wasm':'application/octet-stream','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});return res.end(bytes);}
if(req.method==='GET'&&['/','/app.js','/pwa.mjs','/knowledge-ui.mjs','/ai-page.mjs','/voice-turn.mjs','/voice-preferences.mjs','/threads.mjs','/task-model.mjs','/task-intelligence.mjs','/productivity.mjs','/celebration.mjs','/network.mjs','/style.css','/chat.css','/inbox.css','/records.css','/compact.css'].includes(url.pathname)){
const name=url.pathname==='/'?'index.html':url.pathname.slice(1);const text=await readFile(join(root,name));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':(name.endsWith('.js')||name.endsWith('.mjs'))?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; font-src 'self' blob: data:; img-src 'self' data: blob:; frame-src 'self'; object-src 'none'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"});return res.end(text);}
if(!url.pathname.startsWith('/api/'))return json(res,404,{error:'Not found.'});
if(cloud&&req.method==='POST'&&url.pathname==='/api/auth/login'){
if(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json'))return json(res,403,{error:'Please sign in from the Woven page.'});
await cloud.login(await body(req),res);return json(res,200,{ok:true});
}
let session;
if(cloud){try{session=await cloud.authenticate(req);}catch(e){if(e.status===401&&req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{authRequired:true,authenticated:false});throw e;}}
const csrf=session?.csrf||token;
if(req.method==='GET'&&url.pathname==='/api/status'){
const saved=cloud?await cloud.load(session):{payload:localState};
scheduleLearning(req.headers.cookie||'');
return json(res,200,{authRequired:!!cloud,authenticated:!!session,connected:!!apiKey,model,token:csrf,state:safeState(saved.payload)});
}
if(req.headers.origin!==origin||req.headers['x-woven-token']!==csrf||!String(req.headers['content-type']).startsWith('application/json'))return json(res,403,{error:'Please reload Woven and try again.'});
if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
if(cloud&&url.pathname==='/api/auth/logout'){await cloud.logout(req,res);return json(res,200,{ok:true});}
if(busy)return json(res,409,{error:'I’m still handling the previous request. Please wait a moment.'});
busy=true;
try{
const input=await body(req);
const saved=cloud?await cloud.load(session):{payload:localState,version:null};
let state=saved.payload,version=saved.version;
let requestThread;
try{requestThread=validateThread(state,input.threadId||(input.groupId?'group:'+input.groupId:input.noteId?'note:'+input.noteId:'inbox'));}catch(e){return json(res,400,{error:e.message});}
const finish=(next,text,actions=[])=>appendAssistant(next,text,actions,requestThread);
const archiveCandidates=(next)=>next.groups.filter(g=>!g.archivedAt&&(g.completedAt||g.steps.length>0&&g.steps.every(s=>s.done))).map(g=>({threadId:'group:'+g.id,title:g.title}));
const persist=async next=>{
next=advanceRecurring(next,state);
next=queueLearning(next);
version=await writeState(session,next,version);
state=next;
};
if(url.pathname==='/api/knowledge'){
try{
  if(input.operation==='delete_source'){
    if(input.confirmed!==true||typeof input.sourceKey!=='string'||!input.sourceKey.startsWith('message:'))throw Error('Confirm the conversation message to delete.');
    const id=input.sourceKey.slice(8);if(!state.messages.some(m=>m.id===id&&m.role==='user'))throw Error('This source no longer exists.');
    await persist({...state,messages:state.messages.filter(m=>m.id!==id)});
  }else await persist(changeMemory(state,input));
  return json(res,200,{state:safeState(state)});
}catch(e){return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/notes'){
try{const next=addNote(state,input);requestThread='note:'+next.notes.at(-1).id;finish(next,'Saved as a note. No task or deadline was created.');await persist(next);return json(res,200,{state:safeState(state),note:next.notes.at(-1),threadId:requestThread});}catch(e){return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/task/date'||url.pathname==='/api/task/snooze'){
try{const next=setTaskDate(state,input),group=next.groups.find(g=>g.id===input.groupId),target=input.stepId?group.steps.find(s=>s.id===input.stepId):group;
next.messages.push({id:randomUUID(),role:'user',text:target.title+' — '+target.due+(target.dueTime?' '+target.dueTime:''),thread_id:requestThread,at:new Date().toISOString()});
finish(next,'Saved the date for '+target.title+': '+target.due+(target.dueTime?' · '+target.dueTime:'')+'.',[{type:'set_due',group_id:group.id,step_id:input.stepId||'',due:target.due,title:'',text:'',space:''}]);await persist(next);return json(res,200,{state:safeState(state)});
}catch(e){return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/task/complete'){
try{const next=completeTask(state,input);const group=next.groups.find(g=>g.id===input.groupId),step=group.steps.find(s=>s.id===input.stepId);finish(next,input.reopen?'Task reopened.':input.paid?'Marked as paid. You can attach the receipt for your records.':'Marked as done.',[{type:input.reopen?'reopen_step':'complete_step',group_id:group.id,step_id:step.id,title:'',text:'',due:'',space:''}]);await persist(next);return json(res,200,{state:safeState(state),groupId:group.id,stepId:step.id,archiveCandidates:input.reopen?[]:archiveCandidates(next).filter(c=>c.threadId==='group:'+group.id)});}catch(e){return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/task/finish'){
try{const next=completeGroup(state,input);await persist(next);return json(res,200,{state:safeState(state),archiveCandidates:input.reopen?[]:archiveCandidates(next).filter(c=>c.threadId===requestThread)});}catch(e){return json(res,400,{error:e.message});}
}
if(url.pathname==='/api/record/archive'){
try{const next=archiveRecord(state,{...input,threadId:requestThread});await persist(next);return json(res,200,{state:safeState(state)});}catch(e){return json(res,400,{error:e.message});}
}
if(url.pathname==='/api/record/delete'){
try{
  if(!input.cleanupOnly)await persist(deleteRecord(state,{threadId:requestThread,confirmed:input.confirmed}));
  const remaining=[];
  for(const id of state.pendingFileDeletes||[]){
    if(!/^[0-9a-f-]{36}$/i.test(id)){remaining.push(id);continue;}
    try{if(cloud)await cloud.remove(session,id);else await unlink(join(fileDir,id)).catch(e=>{if(e.code!=='ENOENT')throw e;});}catch{remaining.push(id);}
  }
  if(remaining.length!==(state.pendingFileDeletes||[]).length){try{await persist({...state,pendingFileDeletes:remaining});}catch{/* Deleted files are safe to retry after a concurrent save. */}}
  return json(res,200,{state:safeState(state),cleanupPending:!!state.pendingFileDeletes?.length});
}catch(e){return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/record/checklist'){
try{const next=changeChecklist(state,{...input,threadId:requestThread});await persist(next);const note=requestThread.startsWith('note:')&&next.notes.find(n=>n.id===requestThread.slice(5));const candidates=note?(note.checklist?.length&&note.checklist.every(i=>i.done)&&!note.archivedAt?[{threadId:requestThread,title:note.text.split('\n')[0]}]:[]):archiveCandidates(next).filter(c=>c.threadId===requestThread);return json(res,200,{state:safeState(state),archiveCandidates:input.operation==='toggle'?candidates:[]});}catch(e){return json(res,400,{error:e.message});}
}
if(url.pathname==='/api/record/relations'){
try{const next=setRelations(state,{...input,threadId:requestThread});await persist(next);return json(res,200,{state:safeState(state)});}catch(e){return json(res,400,{error:e.message});}
}
if(url.pathname==='/api/record/action'){
try{const next=saveActionLink(state,{...input,threadId:requestThread});await persist(next);return json(res,200,{state:safeState(state)});}catch(e){return json(res,400,{error:e.message});}
}
if(url.pathname==='/api/record/text'||url.pathname==='/api/record/update'||url.pathname==='/api/record/recurrence'){
try{const handler=url.pathname.endsWith('/text')?editRecordText:url.pathname.endsWith('/update')?addRecordUpdate:setRecurrence;const next=handler(state,{...input,threadId:requestThread});if(url.pathname.endsWith('/text')&&requestThread.startsWith('note:')&&!input.stepId){const note=next.notes.find(n=>'note:'+n.id===requestThread);if(note.money){const fact=receivableFact(note.text.split('\n')[0]);if(fact)note.money={...note.money,...fact,currency:fact.currency||currencyCode(note.text.match(/Currency:\s*([^\n]+)/i)?.[1])||note.money.currency};else delete note.money;}}await persist(next);return json(res,200,{state:safeState(state)});}catch(e){return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/files/analyze'){
try{const {file,bytes}=validateUpload(state,input),inspection=inspectFile(file.name,bytes);let suggestions=suggestFiling(state,file.name,inspection.text),summary=inspection.text.slice(0,360),aiUsed=false,aiUnavailable=false;
if(apiKey&&(inspection.readable||inspection.kind==='image'||inspection.kind==='pdf')){try{const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(filingRequest(state,file.name,bytes,inspection,model)),signal:AbortSignal.timeout(25000)});if(!upstream.ok)throw Error('AI unavailable');const output=await upstream.json();if(output.status!=='completed')throw Error('Incomplete reading');const text=(output.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');const reply=validFilingReply(JSON.parse(text),state);aiUsed=true;summary=reply.summary;if(reply.threadId){const target=filingRecords(state).find(r=>r.threadId===reply.threadId);suggestions=[{threadId:reply.threadId,title:target.title,confidence:reply.confidence,reason:reply.reason},...suggestions.filter(s=>s.threadId!==reply.threadId)].slice(0,4);}else suggestions=[];}catch{aiUnavailable=true;}}
return json(res,200,{analysis:{kind:inspection.kind,contentRead:inspection.contentRead||aiUsed,aiUsed,aiUnavailable,summary,suggestions,readStatus:aiUsed?'Read by AI':inspection.contentRead?'Read filename and document text':inspection.kind==='image'||inspection.kind==='pdf'?'Filename only — connect AI to read this image or PDF':'Filename only — this format has no text preview'}});
}catch(e){return json(res,400,{error:e.message});}
}
if(url.pathname==='/api/files/upload'){
let createdId;try{const {file,bytes}=validateUpload(state,input);let next={...state};if(input.unfiled&&!file.groupId&&!file.noteId){next=addNote(state,{text:input.caption||'File: '+file.name});file.noteId=next.notes.at(-1).id;next.notes.at(-1).fileNoteFor=file.id;requestThread='note:'+file.noteId;}if(cloud)await cloud.upload(session,file.id,bytes);else await writeFile(join(fileDir,file.id),bytes,{flag:'wx'});createdId=file.id;next={...next,files:[...state.files,file]};finish(next,'Saved '+file.name+' for future reference.');await persist(next);return json(res,200,{state:safeState(state),file,threadId:file.noteId?'note:'+file.noteId:file.groupId?'group:'+file.groupId:'inbox'});}catch(e){if(createdId){if(cloud){if(e.status===409)await cloud.remove(session,createdId).catch(()=>{});}else await unlink(join(fileDir,createdId)).catch(()=>{});}return json(res,e.status||400,{error:e.message});}
}
if(url.pathname==='/api/files/download'||url.pathname==='/api/files/view'){
const file=state.files.find(f=>f.id===input.id);if(!file)return json(res,404,{error:'This file was not found.'});
if(!/^[0-9a-f-]{36}$/i.test(file.id))return json(res,400,{error:'Invalid file identifier.'});
const bytes=cloud?await cloud.download(session,file.id):await readFile(join(fileDir,file.id));if(url.pathname.endsWith('/view')){const inspection=inspectFile(file.name,bytes);if(inspection.kind==='unsupported')return json(res,200,{unsupported:true,message:'This file type cannot be previewed here. Download it to open in its original app.'});const preview=inspection.kind==='text'?Buffer.from(inspection.text):bytes;res.writeHead(200,{'Content-Type':inspection.mime+(inspection.kind==='text'?'; charset=utf-8':''),'X-Woven-Preview':inspection.kind,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Disposition':'inline'});return res.end(preview);}
res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Length':bytes.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(bytes);
}
if(url.pathname==='/api/end-flow'){const next=finish({...state},'Your plan is saved. Let’s return to your day.');await persist(next);return json(res,200,{state:safeState(state)});}
if(url.pathname==='/api/connect'){
const candidate=String(input.key||'').trim();if(!candidate.startsWith('sk-')||candidate.length<20)return json(res,400,{error:'Paste your OpenAI API key into this field.'});
let check;try{check=await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`,{headers:{Authorization:`Bearer ${candidate}`},signal:AbortSignal.timeout(25000)});}catch{return json(res,502,{error:'Could not reach OpenAI. Check the internet connection and try again.'});}
if(!check.ok)return json(res,check.status===401?401:400,{error:apiError(check.status)});
apiKey=candidate;return json(res,200,{connected:true,model});
}
if(url.pathname==='/api/disconnect'){apiKey='';return json(res,200,{connected:false});}
if(url.pathname==='/api/voice/speak'){
if(!apiKey)return json(res,401,{error:'Connect AI to hear spoken replies.',connectAI:true});
let greeting;try{if(input.greeting===true)greeting=voiceGreeting(input.languages??[]);}catch(e){return json(res,400,{error:e.message});}const message=greeting?{text:greeting}:state.messages.find(m=>m.id===input.messageId&&m.role==='assistant');if(!message?.text)return json(res,400,{error:'Choose a saved AI reply to listen to.'});
const cacheKey=(process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts')+'|'+greeting,cached=greeting&&input.stream===true&&greetingAudio.get(cacheKey);if(cached){res.writeHead(200,{'Content-Type':'audio/pcm','Cache-Control':'no-store','X-Audio-Sample-Rate':'24000','X-Woven-Voice-Cache':'hit'});return res.end(cached);}const controller=new AbortController();res.once('close',()=>controller.abort());try{const upstream=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',voice:'coral',input:message.text.slice(0,4000),response_format:input.stream===true?'pcm':'mp3',stream_format:'audio'}),signal:AbortSignal.any([AbortSignal.timeout(45000),controller.signal])});if(!upstream.ok)return json(res,502,{error:apiError(upstream.status)});if(input.stream===true){res.writeHead(200,{'Content-Type':'audio/pcm','Cache-Control':'no-store','X-Audio-Sample-Rate':'24000'});res.flushHeaders();let total=0;const greetingChunks=[];for await(const chunk of upstream.body){if(controller.signal.aborted||res.destroyed)throw Error('Audio stopped');total+=chunk.length;if(greeting&&total<=1024*1024)greetingChunks.push(chunk);if(total>8*1024*1024)throw Error('Audio too large');if(!res.write(chunk))await new Promise((resolve,reject)=>{const clean=()=>{res.off('drain',drain);res.off('close',closed);};const drain=()=>{clean();resolve();},closed=()=>{clean();reject(Error('Audio stopped'));};res.once('drain',drain);res.once('close',closed);});}if(greeting&&total>0&&total<=1024*1024){if(greetingAudio.size>=30)greetingAudio.delete(greetingAudio.keys().next().value);greetingAudio.set(cacheKey,Buffer.concat(greetingChunks));}return res.end();}const bytes=Buffer.from(await upstream.arrayBuffer());if(!bytes.length||bytes.length>8*1024*1024)return json(res,502,{error:'The spoken reply could not be prepared.'});return json(res,200,{audio:bytes.toString('base64'),mime:'audio/mpeg',truncated:message.text.length>4000});}catch{if(res.headersSent){res.destroy();return;}return json(res,502,{error:'The spoken reply could not finish. Your written reply is still available.'});}
}
if(url.pathname==='/api/voice/transcribe'){
if(!apiKey)return json(res,401,{error:'Connect AI to use voice input.',connectAI:true});
let form;try{const recent=state.messages.filter(m=>m.role==='user'&&!transcriptNeedsReview(m.text,input.languages??input.language??'auto')&&(input.aiSession?m.ai_session===input.aiSession:m.thread_id===requestThread)).slice(-3).map(m=>m.text).join('\n');form=transcriptionForm(input,process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-transcribe',[threadInfo(state,requestThread)?.title,recent].filter(Boolean).join('\n'));}catch(e){return json(res,400,{error:e.message});}
try{const upstream=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+apiKey},body:form,signal:AbortSignal.timeout(45000)});if(!upstream.ok)return json(res,502,{error:apiError(upstream.status)});const result=await upstream.json();if(typeof result.text!=='string'||!result.text.trim()||result.text.length>12000)return json(res,422,{error:'No clear speech was found. Please try again or type your message.'});return json(res,200,{text:result.text,requiresReview:transcriptNeedsReview(result.text,input.languages??input.language??'auto')});}catch{return json(res,502,{error:'Voice transcription could not finish. Please try again or type your message.'});}
}
if(url.pathname==='/api/chat'){
let aiSession;try{aiSession=assistantSession(input);}catch(e){return json(res,400,{error:e.message});}
const text=String(input.text||'').trim();const image=input.image||null;
if(text.length>12000)return json(res,400,{error:'Please send a shorter message.'});
if(image&&(!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>14*1024*1024))return json(res,400,{error:'Use a PNG, JPEG, WebP or GIF image under 10 MB.'});
if(!text&&!image)return json(res,400,{error:'Write a message or attach an image.'});
const user={id:randomUUID(),role:'user',text:text||'Please read this image and help me organize any tasks.',image,thread_id:requestThread,at:new Date().toISOString()};
if(aiSession){user.intent='assistant_page';user.ai_session=aiSession;}
if(input.voice===true)user.voice=true;
if(input.intent==='analyze_task'){if(!requestThread.startsWith('group:'))return json(res,400,{error:'Choose a task to review.'});user.intent='analyze_task';}
if(input.captureId){if(typeof input.captureId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.captureId))return json(res,400,{error:'Start a new capture and try again.'});user.capture_id=input.captureId;}
const captured=!image&&captureReceivable(state,text,requestThread);
if(captured){const assistant={id:randomUUID(),role:'assistant',text:captured.reply.message,question:captured.reply.question,actions:captured.reply.actions,thread_id:captured.threadId,capture_id:user.capture_id,at:new Date().toISOString(),...(aiSession?{ai_session:aiSession}:{})};user.thread_id=captured.threadId;const next={...captured.next,messages:[...state.messages,user,assistant].slice(-200)};await persist(next);return json(res,200,{state:safeState(state),threadId:captured.threadId});}
if(!apiKey)return json(res,401,{error:'Connect AI to understand this message. Your saved conversations are still available.',connectAI:true});
const scopedState={...state,recentCaptures:state.messages.filter(m=>m.role==='user').slice(-4).map(m=>({text:m.text,thread_id:m.thread_id})),messages:aiSession?assistantHistory(state,aiSession):input.captureId?state.messages.filter(m=>m.capture_id===input.captureId):input.newCapture?[]:threadMessages(state,requestThread),activeThread:threadInfo(state,requestThread)};
let upstream,result;try{upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(buildRequest(scopedState,user,model)),signal:AbortSignal.timeout(45000)});if(upstream.ok)result=await upstream.json();}catch{return json(res,502,{error:'The AI connection timed out or could not be reached. Your existing tasks are unchanged; you can retry.'});}
if(!upstream.ok)return json(res,upstream.status===401?401:502,{error:apiError(upstream.status)});
if(result.status!=='completed')return json(res,502,{error:'The model did not finish its response. Your tasks are unchanged. Please retry.'});
const output=result.output?.filter(x=>x.type==='message').flatMap(x=>x.content||[])||[];
if(output.some(x=>x.type==='refusal'))return json(res,422,{error:'The model could not help with that request. Try describing the task another way.'});
let reply;try{reply=validateReply(JSON.parse(output.filter(x=>x.type==='output_text').map(x=>x.text).join('')));}catch{return json(res,502,{error:'The AI response was incomplete or invalid. Your tasks are unchanged; please retry.'});}
if(user.intent==='analyze_task'&&(reply.memory_actions?.length||reply.actions.some(a=>!['add_step','add_context'].includes(a.type)||'group:'+a.group_id!==requestThread)))return json(res,502,{error:'The step review proposed an unrelated change. Your task is unchanged.'});
reply.actions=normalizeCaptureActions(state,reply.actions,text);const review=financialCreationReview(state,reply,text,requestThread);if(review){reply=review;if(review.relationTarget)requestThread=review.relationTarget;}
let changed,noteState=state;try{changed=applyActions(state,reply.actions.filter(a=>!['create_note','update_note','set_relations'].includes(a.type)));for(const action of reply.actions.filter(a=>a.type==='create_note')){noteState=addNote({...noteState,groups:changed},{text:action.text||action.title,groupId:action.group_id,stepId:action.step_id,category:action.category,space:action.space});const note=noteState.notes.at(-1);note.people=action.people||[];action.note_id=note.id;}
for(const action of reply.actions.filter(a=>a.type==='update_note')){if(!aiSession&&!input.captureId&&requestThread!=='note:'+action.note_id)throw Error('Unknown note');noteState=structuredClone(noteState);const note=noteState.notes.find(n=>n.id===action.note_id);if(!note||!action.text)throw Error('Unknown note');note.text+='\n'+action.text;if(note.money&&/\\d/u.test(action.text))note.money.hasAmountUpdates=true;note.updatedAt=new Date().toISOString();if(!note.category||/^(?:uncategorized|personal|work|family)$/i.test(note.category))Object.assign(note,classifyRecord(note.text,{space:note.space}));note.updates=[...(note.updates||[]),{id:randomUUID(),at:note.updatedAt,kind:'update',text:action.text}].slice(-100);}
for(const action of reply.actions.filter(a=>a.type==='set_relations')){noteState=setRelations({...noteState,groups:changed},{threadId:action.note_id?'note:'+action.note_id:'group:'+action.group_id,category:action.category,people:action.people,parentId:action.parent_id,space:action.space});changed=noteState.groups;}
}catch{return json(res,502,{error:'The AI proposed a change to a task or note it could not identify. Your saved data is unchanged.'});}
if(requestThread==='inbox'||aiSession){const createdNote=reply.actions.find(a=>a.type==='create_note');const groupAction=reply.actions.find(a=>a.group_id&&changed.some(g=>g.id===a.group_id));const dateGroup=reply.question?.date_target?.group_id;const updatedNote=reply.actions.find(a=>a.type==='update_note');if(createdNote)requestThread='note:'+createdNote.note_id;else if(updatedNote)requestThread='note:'+updatedNote.note_id;else if(groupAction)requestThread='group:'+groupAction.group_id;else if(dateGroup&&changed.some(g=>g.id===dateGroup))requestThread='group:'+dateGroup;}
user.thread_id=requestThread;
if(user.intent!=='analyze_task'){const detected=detectRecurrence(text),affected=reply.actions.filter(a=>['create_group','add_step','add_context','set_recurrence'].includes(a.type));const ids=[...new Set(affected.map(a=>a.group_id))];if(detected&&ids.length===1&&!reply.actions.some(a=>a.type==='set_recurrence'||a.recurrence)){const group=changed.find(g=>g.id===ids[0]);if(group)group.recurrence=validateRecurrence(detected);}}
if(user.intent==='analyze_task'){const group=changed.find(g=>'group:'+g.id===requestThread);group.stepsReviewedAt=new Date().toISOString();}
const assistant={id:randomUUID(),role:'assistant',text:reply.message,question:reply.question,actions:reply.actions,thread_id:requestThread,capture_id:user.capture_id,at:new Date().toISOString()};
if(aiSession)assistant.ai_session=aiSession;
let next={...state,groups:changed,notes:noteState.notes,messages:[...state.messages,user,assistant].slice(-200),undo:reply.actions.some(a=>a.type!=='create_note')?[...state.undo,state.groups].slice(-15):state.undo};
try{next=applyMemoryActions(next,reply.memory_actions,text);}catch{return json(res,502,{error:'The memory change could not be safely identified. Your saved data is unchanged. Use What Woven knows to review it.'});}
await persist(next);
return json(res,200,{state:safeState(state),threadId:requestThread,archiveCandidates:reply.actions.some(a=>a.type==='complete_step')?archiveCandidates(next):[],usage:result.usage?{input:result.usage.input_tokens,output:result.usage.output_tokens}:null});
}
if(url.pathname==='/api/undo'){
if(!state.undo.length)return json(res,400,{error:'There is no task change to undo yet.'});const next=structuredClone(state);next.groups=next.undo.pop();finish(next,'I’ve undone the last change to your tasks.');await persist(next);return json(res,200,{state:safeState(state)});
}
return json(res,404,{error:'Not found.'});
}finally{busy=false;scheduleLearning(req.headers.cookie||'');}
}catch(e){json(res,e.status||500,{error:e.status?e.message:'The app could not save this change. Please try again. Your saved data has been preserved.',...(cloud&&e.status===401?{authRequired:true}:{})});}
});
server.listen(port,cloud&&secure?'0.0.0.0':'127.0.0.1',()=>console.log(`Woven is ready: ${origin}`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Woven may already be running. Open http://127.0.0.1:'+port:'Woven could not start: '+e.code);process.exitCode=1;});
