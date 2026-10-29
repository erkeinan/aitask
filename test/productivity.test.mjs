import test from 'node:test';
import assert from 'node:assert/strict';
import {preferences,detectRecurrence,nextRecurringDate,sortedEntries} from '../productivity.mjs';
import {editRecordText,addRecordUpdate,setRecurrence,completeGroup,advanceRecurring} from '../records.mjs';
import {conversationEntries} from '../threads.mjs';
const sample=()=>({groups:[{id:'g',title:'Weekly review',due:'2026-10-20',dueTime:'09:00',steps:[{id:'s',title:'Review notes',due:'2026-10-21',done:false}],sources:[]}],notes:[{id:'n',text:'Original note',createdAt:'2026-10-01T00:00:00Z'}],files:[{id:'file',groupId:'g',stepId:'s'}],messages:[],undo:[]});
test('direct text edits keep dated history and reject stale writes without changing the source state',()=>{
 const original=sample(),next=editRecordText(original,{threadId:'group:g',stepId:'s',text:'Review revised notes',expected:'Review notes'});assert.equal(next.groups[0].steps[0].title,'Review revised notes');assert.equal(next.groups[0].updates[0].previousText,'Review notes');assert.ok(Number.isFinite(Date.parse(next.groups[0].updates[0].at)));assert.equal(original.groups[0].steps[0].title,'Review notes');
 assert.throws(()=>editRecordText(next,{threadId:'group:g',stepId:'s',text:'Stale edit',expected:'Review notes'}),e=>e.status===409);assert.throws(()=>editRecordText(next,{threadId:'note:n',text:'  '}));
 const note=editRecordText(original,{threadId:'note:n',text:'New note'});assert.equal(note.notes[0].text,'New note');assert.equal(note.notes[0].updates[0].kind,'edit');
});
test('adding an update preserves task text and records a timestamp',()=>{
 const next=addRecordUpdate(sample(),{threadId:'group:g',text:'Called John; waiting for a reply.'});assert.equal(next.groups[0].title,'Weekly review');assert.equal(next.groups[0].updates[0].kind,'update');assert.match(next.groups[0].updates[0].at,/Z$/);assert.equal(next.groups[0].steps[0].done,false);
});
test('recurring patterns support explicit English and Hebrew frequencies and respect manual stop',()=>{
 assert.deepEqual(detectRecurrence('Water plants every 2 weeks'),{frequency:'weekly',interval:2});assert.equal(detectRecurrence('Call every Monday').weekday,1);assert.equal(detectRecurrence('לשלוח דוח כל יום חמישי').weekday,4);assert.equal(detectRecurrence('בדיקה חודשית').frequency,'monthly');assert.equal(detectRecurrence('One-off review').frequency,'none');assert.equal(detectRecurrence('Call tomorrow'),null);
 const state=sample();state.groups[0].title='Review every week';const detected=setRecurrence(state,{threadId:'group:g',detect:true});assert.equal(detected.groups[0].recurrence.frequency,'weekly');const stopped=setRecurrence(detected,{threadId:'group:g',rule:{frequency:'none'}});assert.equal(setRecurrence(stopped,{threadId:'group:g',detect:true}).groups[0].recurrence,null);assert.throws(()=>setRecurrence(state,{threadId:'note:n',rule:{frequency:'daily',interval:1}}));
});
test('calendar repeats clamp month ends, preserve anchors, and skip missed occurrences',()=>{
 assert.equal(nextRecurringDate('2027-01-31',{frequency:'monthly',interval:1},'2027-01-31'),'2027-02-28');assert.equal(nextRecurringDate('2027-02-28',{frequency:'monthly',interval:1,anchorDay:31},'2027-02-28'),'2027-03-31');
 assert.equal(nextRecurringDate('2027-02-28',{frequency:'yearly',interval:1,anchorDay:29},'2027-02-28'),'2028-02-29');assert.equal(nextRecurringDate('2026-10-01',{frequency:'weekly',interval:1},'2026-10-22'),'2026-10-29');assert.equal(nextRecurringDate('2026-10-22',{frequency:'weekly',interval:1,weekday:1},'2026-10-22'),'2026-10-26');
});
test('completing a recurring task creates exactly one clean occurrence and keeps the completed record',()=>{
 const original=setRecurrence(sample(),{threadId:'group:g',rule:{frequency:'weekly',interval:1}}),completed=completeGroup(original,{groupId:'g'}),now=new Date('2026-10-22T12:00:00Z'),next=advanceRecurring(completed,original,now);assert.equal(next.groups.length,2);assert.ok(next.groups[0].completedAt);const fresh=next.groups[1];assert.equal(fresh.due,'2026-10-27');assert.equal(fresh.steps[0].due,'2026-10-28');assert.equal(fresh.steps[0].done,false);assert.notEqual(fresh.steps[0].id,'s');assert.equal(fresh.occurrenceOf,'g');assert.equal(fresh.completedAt,undefined);assert.equal(next.files[0].groupId,'g');assert.equal(advanceRecurring(completeGroup(next,{groupId:'g'}),next,now).groups.length,2);assert.equal(conversationEntries(next,{archived:true}).length,1);
 const stopped=setRecurrence(next,{threadId:'group:g',rule:{frequency:'none'}});assert.equal(stopped.groups[1].recurrence,null);
});
test('default sorting puts overdue and next due tasks first; alternate sorts cover notes and titles',()=>{
 const state=sample();state.groups.push({id:'later',title:'A later task',due:'2026-10-25',steps:[]},{id:'undated',title:'Undated',steps:[]});const entries=conversationEntries(state);assert.deepEqual(sortedEntries(entries).map(e=>e.id),['group:g','group:later','group:undated','note:n']);assert.equal(sortedEntries(entries,'notes')[0].id,'note:n');assert.equal(sortedEntries(entries,'title')[0].id,'group:later');
});
test('appearance and reward preferences accept only known values',()=>{
 assert.deepEqual(preferences({theme:'dark',accent:'ocean',effect:'stars',direction:'up',sort:'notes'}),{voiceMode:'record',fontSize:'medium',theme:'dark',accent:'ocean',effect:'stars',direction:'up',sort:'notes'});assert.equal(preferences({theme:'script',effect:'unknown',sort:'unknown'}).sort,'due');
});
