import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureFile} from '../capture-file.mjs';
import {buildRequest,initialState} from '../assistant.mjs';
import {mergeCaptureSync} from '../capture-sync.mjs';

test('file content goes directly into the normal assistant request',()=>{
 const image=captureFile('chat.png',Buffer.from([137,80,78,71,13,10,26,10])),pdf=captureFile('invoice.pdf',Buffer.from('%PDF-1.7'));
 assert.equal(image.type,'input_image');assert.equal(pdf.type,'input_file');
 const fileInput=captureFile('receipt.txt',Buffer.from('Store receipt: 120 ILS paid'));
 const request=buildRequest(initialState(),{text:'Read this file',fileInput},'test');
 assert.equal(request.input.at(-1).content[1],fileInput);assert.match(fileInput.text,/120 ILS paid/);assert.match(fileInput.text,/UNTRUSTED/);
 assert.throws(()=>captureFile('archive.zip',Buffer.from('zip')),/cannot be read/);
});
test('out-of-order background sync preserves newer AI changes and new queued entries',()=>{
 const current={clientRevision:8,groups:[{id:'saved',title:'Newer AI task'},{id:'queued',offlinePending:true}],notes:[]};
 const remote={clientRevision:7,groups:[{id:'queued',title:'Synced task'}],notes:[]};
 const result=mergeCaptureSync(current,remote,[{id:'next',kind:'note',text:'Another note',at:'2026-10-29'}],['queued']);
 assert.equal(result.clientRevision,8);assert.equal(result.groups.find(g=>g.id==='saved').title,'Newer AI task');assert.equal(result.groups.find(g=>g.id==='queued').offlinePending,undefined);assert.equal(result.notes[0].id,'next');assert.equal(result.notes[0].offlinePending,true);assert.equal(current.groups[1].offlinePending,true);
});
test('one chat request reads a file without storing its original; one voice request transcribes and saves',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'woven-v4-')),origin='http://127.0.0.1:14341';
 const server=spawn(process.execPath,['--import','./test/fixtures/fake-ai.mjs','server.mjs'],{cwd:root,env:{...process.env,PORT:'14341',WOVEN_APP_URL:origin,WOVEN_STORAGE:'',NODE_ENV:'test',RENDER:'',OPENAI_API_KEY:'test-only',WOVEN_DATA_DIR:dir},windowsHide:true,stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.stderr.once('data',v=>{clearTimeout(timer);reject(Error(String(v)));});});
 const {token,state:before}=await(await fetch(origin+'/api/status')).json();
 const post=(path,data)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Woven-Token':token},body:JSON.stringify({threadId:'inbox',...data})});
 const file={name:'receipt.txt',data:Buffer.from('Store receipt: 120 ILS paid').toString('base64')};
 const response=await post('/api/chat',{text:'Read receipt',file,newCapture:true});assert.equal(response.status,200);const result=await response.json();assert.equal(result.state.notes.length,before.notes.length+1);assert.equal(result.state.files.length,before.files.length);
 const persisted=await readFile(join(dir,'state.json'),'utf8');assert.ok(!persisted.includes(file.data));assert.ok(!persisted.includes('fileInput'));assert.deepEqual(await readdir(join(dir,'files')),[]);
 const kept=await post('/api/files/upload',{...file,noteId:result.threadId.slice(5)});assert.equal(kept.status,200);assert.equal((await kept.json()).state.files.length,before.files.length+1);
 const voice=await post('/api/chat',{audio:Buffer.from('sample recording').toString('base64'),mime:'audio/webm',languages:['en'],newCapture:true});assert.equal(voice.status,200);const spoken=await voice.json();assert.equal(spoken.transcript,'Call Alex tomorrow');assert.ok(spoken.state.notes.some(n=>n.text==='Call Alex tomorrow'));assert.ok(spoken.state.clientRevision>result.state.clientRevision);
 const review=await post('/api/chat',{audio:Buffer.from('arabic-case').toString('base64'),mime:'audio/webm',languages:['he'],newCapture:true});assert.equal(review.status,200);const reviewed=await review.json();assert.equal(reviewed.requiresReview,true);assert.equal(reviewed.state.notes.length,spoken.state.notes.length);
});
