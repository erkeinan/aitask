import test from 'node:test';
import assert from 'node:assert/strict';
import {localClock,recordSchedule,scheduleStatus,stepSchedule,snoozeSchedule,relatedRecords} from '../task-model.mjs';
import {setTaskDate,completeGroup,completeTask,archiveRecord,deleteRecord,changeChecklist,setRelations} from '../records.mjs';
import {conversationEntries} from '../threads.mjs';
const sample=()=>({groups:[{id:'main',title:'Project',space:'Work',due:'2026-10-21',people:['John'],steps:[{id:'call',title:'Call John',done:false}]}],notes:[{id:'note1',text:'Shopping:\n- Milk\n- Bread',groupId:'main',stepId:'',category:'Work',people:['John']}],messages:[{role:'assistant',text:'Old chat text never used as a preview',thread_id:'group:main'}],files:[],undo:[]});
const now=new Date('2026-10-21T09:00:00Z');
test('today is yellow, past hours and dates are red, and absent hours are not invented',()=>{
  assert.equal(localClock(now).date,'2026-10-21');
  assert.equal(scheduleStatus({date:'2026-10-21',time:'18:00'},now).tone,'today');
  assert.match(scheduleStatus({date:'2026-10-21',time:'18:00'},now).label,/18:00/);
  assert.equal(scheduleStatus({date:'2026-10-21',time:'08:00'},now).tone,'overdue');
  assert.match(scheduleStatus({date:'2026-10-20'},now).label,/20 Oct 2026/);
  assert.match(scheduleStatus({date:'2026-10-21'},now).label,/no time set/);
  assert.equal(scheduleStatus({date:'2026-10-22'},now).tone,'future');
  assert.equal(scheduleStatus({date:'2026-10-20'},now,true).tone,'complete');
  const group=sample().groups[0];group.dueTime='15:00';assert.equal(stepSchedule(group,{id:'different',due:'2026-10-25'}).time,'');
  assert.equal(stepSchedule(group,{id:'old',title:'ארוחת ערב ב-19:00',due:'2026-10-21'}).time,'19:00');
  assert.equal(stepSchedule(group,{id:'edited',title:'Dinner at 19:00',dueTime:''}).time,'');
});
test('nearest unfinished deadline is shown and snooze preserves the original date',()=>{
  const state=sample();state.groups[0].steps.push({id:'urgent',title:'Send form',due:'2026-10-19',done:false});
  assert.equal(recordSchedule(state.groups[0],now).stepId,'urgent');
  const snoozed=setTaskDate(state,{groupId:'main',stepId:'urgent',date:'2026-10-23',time:'09:00',snooze:true});
  assert.equal(snoozed.groups[0].steps[1].originalDue.date,'2026-10-19');assert.ok(snoozed.groups[0].steps[1].snoozedAt);assert.equal(state.groups[0].steps[1].due,'2026-10-19');
  assert.equal(snoozeSchedule('tomorrow',now).date,'2026-10-22');assert.equal(snoozeSchedule('tomorrow',now).time,'09:00');
  const before=localClock(now),after=snoozeSchedule('hour',now);assert.equal(Number(after.time.slice(0,2)),Number(before.time.slice(0,2))+1);
  assert.throws(()=>setTaskDate(state,{groupId:'main',date:'2026-10-23',time:'26:00'}),/valid time/);
});
test('completed tasks leave the active list, appear in Completed, and restore as active',()=>{
  const complete=completeGroup(sample(),{groupId:'main'});assert.equal(complete.groups[0].archivedAt,undefined);
  assert.equal(conversationEntries(complete).some(r=>r.id==='group:main'),false);assert.equal(conversationEntries(complete,{archived:true})[0].id,'group:main');
  assert.throws(()=>archiveRecord(complete,{threadId:'group:main'}),/Confirm/);
  const archived=archiveRecord(complete,{threadId:'group:main',confirmed:true});assert.equal(conversationEntries(archived).some(r=>r.id==='group:main'),false);assert.equal(conversationEntries(archived,{archived:true})[0].id,'group:main');
  const restored=archiveRecord(archived,{threadId:'group:main',restore:true});assert.equal(restored.groups[0].archivedAt,undefined);assert.equal(restored.groups[0].steps[0].done,false);assert.ok(conversationEntries(restored).some(r=>r.id==='group:main'));
  const reopened=completeTask(restored,{groupId:'main',stepId:'call',reopen:true});assert.equal(reopened.groups[0].completedAt,undefined);
});
test('permanent deletion needs confirmation, clears undo and preserves linked items',()=>{
  const state=sample();state.groups.push({id:'child',title:'Child',parentId:'main',steps:[]});state.undo=[structuredClone(state.groups)];
  state.messages.push({id:'m1',thread_id:'group:main',text:'Project',capture_id:'capture1'},{id:'m2',thread_id:'inbox',text:'Project details',capture_id:'capture1'});
  state.files=[{id:'11111111-1111-4111-8111-111111111111',groupId:'main'},{id:'22222222-2222-4222-8222-222222222222',groupId:'main',noteId:'note1'}];
  assert.throws(()=>deleteRecord(state,{threadId:'group:main'}),/Confirm/);
  const next=deleteRecord(state,{threadId:'group:main',confirmed:true});assert.equal(next.groups.length,1);assert.equal(next.groups[0].parentId,'');assert.equal(next.notes[0].groupId,'');assert.equal(next.notes[0].text,state.notes[0].text);assert.equal(next.files.length,1);assert.equal(next.files[0].groupId,'');assert.equal(next.undo.length,0);assert.ok(!next.messages.some(m=>m.capture_id==='capture1'));assert.equal(next.pendingFileDeletes.length,1);
  assert.equal(state.groups.length,2);assert.throws(()=>deleteRecord(state,{threadId:'inbox',confirmed:true}),/Choose/);
});
test('note checklists retain original text, add items, and persist check marks',()=>{
  const original=sample();const enabled=changeChecklist(original,{threadId:'note:note1',operation:'enable'});assert.equal(enabled.notes[0].text,original.notes[0].text);assert.deepEqual(enabled.notes[0].checklist.map(i=>i.text),['Milk','Bread']);
  const added=changeChecklist(enabled,{threadId:'note:note1',operation:'add',text:'Eggs'});const checked=changeChecklist(added,{threadId:'note:note1',operation:'toggle',itemId:added.notes[0].checklist[0].id,done:true});assert.equal(checked.notes[0].checklist[0].done,true);assert.equal(added.notes[0].checklist[0].done,false);
  assert.equal(changeChecklist(checked,{threadId:'note:note1',operation:'disable'}).notes[0].isChecklist,false);
});
test('relationships navigate parent tasks, categories and people; cycles are rejected',()=>{
  const state=sample();state.groups.push({id:'child',title:'Book meeting',space:'Work',steps:[]});
  const linked=setRelations(state,{threadId:'group:child',category:'Work',people:['John','john'],parentId:'main'});assert.deepEqual(linked.groups[1].people,['john']);
  const relation=relatedRecords(linked,'group:child');assert.equal(relation.ancestors[0].id,'group:main');assert.ok(relation.categoryRecords.some(r=>r.id==='group:main'));assert.ok(relation.personRecords.john.some(r=>r.id==='group:main'));
  assert.throws(()=>setRelations(linked,{threadId:'group:main',parentId:'child'}),/parent or descendant/);
  assert.ok(relatedRecords(linked,'group:main').children.some(r=>r.id==='note:note1'));
});
