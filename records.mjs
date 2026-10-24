import {randomUUID} from 'node:crypto';
import {normalDate,checklistLines,snoozeSchedule} from './task-model.mjs';
import {threadMessages,recordCompleted} from './threads.mjs';
import {safeTarget,actionKinds} from './task-intelligence.mjs';
import {validateRecurrence,detectRecurrence,nextRecurringDate} from './productivity.mjs';
import {localClock,stepSchedule} from './task-model.mjs';
import {classifyRecord} from './segmentation.mjs';
export function addNote(state,{text,groupId='',stepId='',category='',space=''}){
if(typeof category!=='string'||category.length>100||space&&!['Personal','Work','Family'].includes(space))throw Error('Use a valid category and segment.');
if(typeof text!=='string'||!text.trim()||text.length>20000)throw Error('Write a note first (up to 20,000 characters).');
validateTarget(state,{groupId,stepId});
const note={id:randomUUID(),text:text.trim(),groupId,stepId,...classifyRecord(text,{space,category,parent:state.groups.find(g=>g.id===groupId)}),createdAt:new Date().toISOString()};
return {...state,notes:[...(state.notes||[]),note]};
}
export function validateTarget(state,{groupId='',stepId='',noteId=''}){
if(groupId){const group=state.groups.find(g=>g.id===groupId);if(!group)throw Error('This task group was not found.');if(stepId&&!group.steps.some(s=>s.id===stepId))throw Error('This task was not found.');}else if(stepId)throw Error('Choose a task group first.');
if(noteId&&!(state.notes||[]).some(n=>n.id===noteId))throw Error('This note was not found.');
}
export function completeTask(state,{groupId,stepId,paid=false,reopen=false}){
validateTarget(state,{groupId,stepId});if(!groupId||!stepId)throw Error('Choose a task to update.');
const next=structuredClone(state);const group=next.groups.find(g=>g.id===groupId),step=group.steps.find(s=>s.id===stepId);
if(step.done===!reopen&&(!paid||step.paidAt))return next;
next.undo=[...next.undo,state.groups].slice(-15);step.done=!reopen;
if(reopen){delete step.completedAt;delete step.paidAt;delete group.archivedAt;delete group.completedAt;}else{step.completedAt=new Date().toISOString();if(paid)step.paidAt=step.completedAt;}
return next;
}
export function setTaskDate(state,{groupId,stepId='',date,time='',snooze=false,preset=''}){
validateTarget(state,{groupId,stepId});if(!groupId)throw Error('Choose a task first.');
if(preset){const scheduled=snoozeSchedule(preset);date=scheduled.date;time=scheduled.time;snooze=true;}
if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Choose a valid date.');
const next=structuredClone(state),group=next.groups.find(g=>g.id===groupId),target=stepId?group.steps.find(s=>s.id===stepId):group;
if(typeof time!=='string'||(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))throw Error('Choose a valid time.');
next.undo=[...next.undo,state.groups].slice(-15);if(snooze){target.originalDue??={date:target.due||group.due||'',time:target.dueTime||group.dueTime||''};target.snoozedAt=new Date().toISOString();}else delete target.snoozedAt;target.due=date;target.dueTime=time;return next;
}
function recordAt(state,threadId){const note=String(threadId).startsWith('note:');const id=String(threadId).slice(String(threadId).indexOf(':')+1);const record=(note?state.notes:state.groups).find(r=>r.id===id);if(!record)throw Error('This item was not found.');return {record,note};}
export function archiveRecord(state,{threadId,confirmed=false,restore=false}){if(!restore&&confirmed!==true)throw Error('Confirm before archiving this item.');const next=structuredClone(state),{record}=recordAt(next,threadId);if(restore){delete record.archivedAt;if(recordCompleted(record)){delete record.completedAt;for(const item of record.steps||record.checklist||[]){item.done=false;delete item.completedAt;delete item.paidAt;}}}else record.archivedAt=new Date().toISOString();return next;}
export function deleteRecord(state,{threadId,confirmed=false}){
  if(confirmed!==true)throw Error('Confirm permanent deletion first.');
  if(!/^(group|note):.+$/.test(String(threadId)))throw Error('Choose a task or note.');
  const next=structuredClone(state),{record,note}=recordAt(next,threadId),id=record.id;
  const messages=threadMessages(state,threadId),messageIds=new Set(messages.map(m=>m.id)),captures=new Set(messages.map(m=>m.capture_id).filter(Boolean));
  next.messages=next.messages.filter(m=>!messageIds.has(m.id)&&!(m.capture_id&&captures.has(m.capture_id)));
  const removedFiles=next.files.filter(f=>note?f.noteId===id:f.groupId===id&&!f.noteId);
  if(removedFiles.some(f=>!/^[0-9a-f-]{36}$/i.test(f.id)))throw Error('Invalid file identifier.');
  next.files=next.files.filter(f=>!removedFiles.some(r=>r.id===f.id));
  next.pendingFileDeletes=[...new Set([...(next.pendingFileDeletes||[]),...removedFiles.map(f=>f.id)])];
  if(note)next.notes=next.notes.filter(n=>n.id!==id);
  else{
    next.groups=next.groups.filter(g=>g.id!==id);for(const group of next.groups)if(group.parentId===id)group.parentId='';
    for(const item of next.notes)if(item.groupId===id){item.groupId='';item.stepId='';}
    for(const file of next.files)if(file.groupId===id){file.groupId='';file.stepId='';}
  }
  next.undo=[];return next;
}
export function completeGroup(state,{groupId,reopen=false}){validateTarget(state,{groupId});if(!groupId)throw Error('Choose a task.');const next=structuredClone(state),group=next.groups.find(g=>g.id===groupId);next.undo=[...next.undo,state.groups].slice(-15);for(const step of group.steps){step.done=!reopen;if(reopen)delete step.completedAt;else step.completedAt=new Date().toISOString();}group.completedAt=reopen?null:new Date().toISOString();if(reopen)delete group.archivedAt;return next;}
export function changeChecklist(state,{threadId,operation,itemId,text='',done,lines,splitSteps}){
  const next=structuredClone(state),{record,note}=recordAt(next,threadId);
  const validLines=items=>{if(!Array.isArray(items)||!items.length||items.length>100||items.some(v=>typeof v!=='string'||!v.trim()||v.length>2000))throw Error('Use one checklist item per line (up to 100).');return items.map(v=>v.trim());};
  if(operation==='enable'){
    record.isChecklist=true;
    if(note&&!record.checklist)record.checklist=validLines(lines??checklistLines(record.text)).map(text=>({id:randomUUID(),text,done:false}));
    if(!note&&!record.checklistSplit){
      if(splitSteps!==undefined&&(!Array.isArray(splitSteps)||splitSteps.length!==record.steps.length||new Set(splitSteps.map(s=>s.stepId)).size!==record.steps.length||splitSteps.some(s=>!record.steps.some(step=>step.id===s.stepId))))throw Error('The task steps changed. Reopen the checklist preview.');
      record.steps=record.steps.flatMap(step=>{const items=validLines(splitSteps?.find(s=>s.stepId===step.id)?.lines??checklistLines(step.title));return items.map((title,i)=>({...step,id:i?randomUUID():step.id,title,sourceTitle:step.sourceTitle||step.title,...(i?{sourceStepId:step.id,actionLinks:[]}:{} )}));});
      record.checklistSplit=true;
    }
    return next;
  }
  if(operation==='disable'){record.isChecklist=false;return next;}
  const items=note?record.checklist:record.steps;if(!Array.isArray(items))throw Error('Make this a checklist first.');
  if(operation==='add'){if(typeof text!=='string'||!text.trim()||text.length>1000)throw Error('Write a checklist item.');items.push({id:randomUUID(),[note?'text':'title']:text.trim(),done:false});record.isChecklist=true;delete record.completedAt;return next;}
  if(operation==='toggle'){if(typeof done!=='boolean')throw Error('Choose a checklist status.');const item=items.find(i=>i.id===itemId);if(!item)throw Error('Checklist item not found.');item.done=done;if(!done){delete record.archivedAt;delete record.completedAt;}return next;}
  throw Error('Choose a checklist action.');
}
export function saveActionLink(state,{threadId,stepId='',type,target='',draft=''}){
  const next=structuredClone(state),{record,note}=recordAt(next,threadId);
  if(!actionKinds[type]||typeof draft!=='string'||draft.length>4000)throw Error('Choose a supported action and a short draft.');
  const item=stepId?(note?record.checklist:record.steps)?.find(s=>s.id===stepId):record;if(!item)throw Error('This step was not found.');
  const action={type,target:safeTarget(type,target),draft};item.actionLinks=[...(item.actionLinks||[]).filter(a=>a.type!==type),action];return next;
}
function addHistory(record,text,kind='update',extra={}){record.updates=[...(record.updates||[]),{id:randomUUID(),at:new Date().toISOString(),kind,text,...extra}].slice(-200);record.updatedAt=new Date().toISOString();}
export function editRecordText(state,{threadId,stepId='',field='text',text,expected}){
  if(typeof text!=='string'||!text.trim()||text.length>20000)throw Error('Write some text (up to 20,000 characters).');
  const next=structuredClone(state),{record,note}=recordAt(next,threadId);let target=record,key=note?'text':'title';
  if(stepId){target=(note?record.checklist:record.steps)?.find(s=>s.id===stepId);if(!target)throw Error('This item was not found.');key=note?'text':'title';}
  else if(!note&&field==='description')key='description';
  const previous=target[key]||'';if(expected!==undefined&&expected!==previous)throw Object.assign(Error('This text changed elsewhere. Reload before updating it.'),{status:409});
  if(previous===text.trim())return next;target[key]=text.trim();
  if(note&&stepId&&!record.money){record.originalText??=record.text;const heading=record.originalText.split('\n')[0];record.text=(/:$/.test(heading)?heading+'\n':'')+record.checklist.map(i=>i.text).join('\n');}
  if(!note){const rule=detectRecurrence(text);if(rule){record.recurrence=validateRecurrence(rule);record.recurrenceExplicit=true;}}
  addHistory(record,text.trim(),'edit',{field:stepId?'item':key,stepId,previousText:previous});return next;
}
export function addRecordUpdate(state,{threadId,text}){
  if(typeof text!=='string'||!text.trim()||text.length>10000)throw Error('Write an update (up to 10,000 characters).');const next=structuredClone(state),{record}=recordAt(next,threadId);addHistory(record,text.trim());return next;
}
export function setRecurrence(state,{threadId,rule,detect=false}){
  const next=structuredClone(state),{record,note}=recordAt(next,threadId);if(note)throw Error('Only tasks can repeat.');
  if(!detect&&!rule)throw Error('Choose a repeat schedule or Does not repeat.');
  if(detect){if(record.recurrence||record.recurrenceExplicit)return next;rule=detectRecurrence([record.title,...record.steps.map(s=>s.title),...(record.sources||[])].join('\n'));if(!rule||rule.frequency==='none')return next;}
  record.recurrence=validateRecurrence(rule);record.recurrenceExplicit=!detect;addHistory(record,record.recurrence?(detect?'Repeating pattern detected.':'Repeat schedule updated.'):'Repeating turned off.','repeat');
  if(!detect){const series=record.seriesId||record.id;for(const group of next.groups)if(group.id!==record.id&&(group.seriesId||group.id)===series&&!recordCompleted(group)){group.recurrence=record.recurrence?{...record.recurrence}:null;group.recurrenceExplicit=true;addHistory(group,record.recurrence?'Repeat schedule updated.':'Repeating turned off.','repeat');}}
  return next;
}
export function advanceRecurring(state,previous,now=new Date()){
  const next=structuredClone(state),today=localClock(now).date;
  for(const record of [...next.groups]){
    const before=previous.groups.find(g=>g.id===record.id);if(!record.recurrence||!before||recordCompleted(before)||!recordCompleted(record)||record.nextOccurrenceId)continue;
    const rule=validateRecurrence(record.recurrence);if(!rule)continue;
    const base=normalDate(record.due)||record.steps.map(s=>stepSchedule(record,s,today).date).filter(Boolean).sort()[0]||today;
    rule.anchorDay??=Number(base.slice(-2));record.recurrence=rule;const date=nextRecurringDate(base,rule,today),delta=(Date.parse(date+'T12:00:00Z')-Date.parse(base+'T12:00:00Z'))/86400000;
    const copy=structuredClone(record);copy.id=randomUUID();copy.seriesId=record.seriesId||record.id;copy.occurrenceOf=record.id;copy.due=date;copy.createdAt=copy.updatedAt=now.toISOString();copy.updates=[{id:randomUUID(),at:now.toISOString(),kind:'repeat',text:'Next occurrence created.'}];
    for(const key of ['completedAt','archivedAt','nextOccurrenceId','snoozedAt','originalDue'])delete copy[key];
    copy.steps=copy.steps.map(step=>{const item={...step,id:randomUUID(),done:false};for(const key of ['completedAt','paidAt','snoozedAt','originalDue','sourceStepId'])delete item[key];const due=stepSchedule(record,step,today).date;if(due)item.due=new Date(Date.parse(due+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10);return item;});
    record.nextOccurrenceId=copy.id;next.groups.push(copy);
  }
  return next;
}
export function setRelations(state,{threadId,category='',people=[],parentId='',space=''}){
  if(space&&!['Work','Personal','Family'].includes(space))throw Error('Choose a valid segment.');
  if(typeof category!=='string'||category.length>100||!Array.isArray(people)||people.length>20||people.some(p=>typeof p!=='string'||!p.trim()||p.length>100))throw Error('Use a category and a list of people.');
  const next=structuredClone(state),{record,note}=recordAt(next,threadId);
  if(parentId){if(!next.groups.some(g=>g.id===parentId))throw Error('Parent task not found.');let current=parentId;const seen=new Set();while(current){if((!note&&current===record.id)||seen.has(current))throw Error('A task cannot be its own parent or descendant.');seen.add(current);current=next.groups.find(g=>g.id===current)?.parentId;}}
  record.category=category.trim();if(space)record.space=space;record.people=[...new Map(people.map(p=>[p.trim().toLocaleLowerCase(),p.trim()])).values()];if(note){if(record.groupId!==parentId)record.stepId='';record.groupId=parentId;}else record.parentId=parentId;return next;
}
export function validateUpload(state,input){
validateTarget(state,input);const name=String(input.name||'').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,160).trim();
if(!name)throw Error('Choose a file to save.');
if(typeof input.data!=='string'||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)||input.data.length%4!==0)throw Error('The file could not be read.');
const bytes=Buffer.from(input.data,'base64');if(bytes.length>10*1024*1024)throw Error('Choose a file smaller than 10 MB.');
return {bytes,file:{id:randomUUID(),name,size:bytes.length,groupId:input.groupId||'',stepId:input.stepId||'',noteId:input.noteId||'',createdAt:new Date().toISOString()}};
}
