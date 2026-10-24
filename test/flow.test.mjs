import test from 'node:test';
import assert from 'node:assert/strict';
import {setTaskDate} from '../records.mjs';
import {requestJSON} from '../network.mjs';
import {buildRequest,schema,validateReply} from '../assistant.mjs';

const state={groups:[{id:'dinner',title:'Dinner',due:'2026-10-23',steps:[{id:'book',title:'Book a table',done:false}],sources:[]}],messages:[],notes:[],files:[],undo:[]};
test('calendar updates the chosen task directly and supports undo',()=>{
  const next=setTaskDate(state,{groupId:'dinner',stepId:'book',date:'2026-11-04'});
  assert.equal(next.groups[0].steps[0].due,'2026-11-04');assert.equal(next.groups[0].due,'2026-10-23');
  assert.equal(state.groups[0].steps[0].due,undefined);assert.deepEqual(next.undo[0],state.groups);
  for(const date of ['2026-02-30','invalid','2026-13-01','2026-1-2'])assert.throws(()=>setTaskDate(state,{groupId:'dinner',stepId:'book',date}),/valid date/);
  assert.throws(()=>setTaskDate(state,{groupId:'dinner',stepId:'missing',date:'2026-10-22'}),/not found/);
});
test('a stalled request or stalled response body times out and aborts',async()=>{
  let aborted=false;
  await assert.rejects(requestJSON('/api/chat',{}, {timeoutMs:20,fetcher:async(_,opts)=>{opts.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});}}),/Refresh the conversation/);
  assert.equal(aborted,true);
  await assert.rejects(requestJSON('/api/chat',{}, {timeoutMs:20,fetcher:async()=>({json:()=>new Promise(()=>{})})}),/Refresh the conversation/);
});
test('natural notes and ambiguous intent have explicit guidance, and date targets are structured',()=>{
  const request=buildRequest(state,{text:'Maya prefers email'},'gpt-4.1');
  assert.match(request.instructions,/never need to select a mode/);assert.match(request.instructions,/Maya prefers email/);assert.match(request.instructions,/genuinely unclear/);assert.match(request.instructions,/continues that task/);
  const question=schema.properties.question.anyOf[1];assert.ok(question.required.includes('date_target'));
  const reply={message:'When?',actions:[],question:{title:'Choose a date',options:[],allow_date:true,date_target:{group_id:'dinner',step_id:'book'}}};
  assert.equal(validateReply(reply).question.date_target.step_id,'book');
});
