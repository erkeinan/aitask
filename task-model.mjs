import {splitList} from './task-intelligence.mjs';
export const taskTimeZone='Asia/Jerusalem';
export function localClock(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:taskTimeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
export function normalDate(value,today=localClock().date){
  const raw=String(value||'').trim();let date=raw;
  if(/^today$/i.test(raw))date=today;
  if(/^tomorrow$/i.test(raw))date=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(m)date=`${m[3].length===2?'20'+m[3]:m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const stamp=Date.parse(date+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date?date:null;
}
export function stepSchedule(group,step,today=localClock().date){
  const embedded=String(step?.title||'').match(/\b(?:due|deadline)(?:\s+on)?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\b/i);
  const writtenTime=String(step?.title||'').match(/(?:^|[^\d])(\d{1,2}):([0-5]\d)(?!\d)/);
  const titleTime=writtenTime&&Number(writtenTime[1])<24?writtenTime[1].padStart(2,'0')+':'+writtenTime[2]:'';
  const time=step?.dueTime!==undefined?step.dueTime:(titleTime||(step?.due||embedded?.[1]?'':group.dueTime||''));
  return {date:normalDate(step?.due||embedded?.[1]||group.due,today),time,groupId:group.id,stepId:step?.id||'',title:step?.title||group.title,snoozed:!!(step?.snoozedAt||group.snoozedAt)};
}
export function recordSchedule(group,now=new Date()){
  const today=localClock(now).date,open=(group.steps||[]).filter(s=>!s.done);
  const candidates=open.map(step=>stepSchedule(group,step,today)).filter(s=>s.date).sort((a,b)=>(a.date+(a.time||'23:59')).localeCompare(b.date+(b.time||'23:59')));
  return candidates[0]||stepSchedule(group,null,today);
}
export function scheduleStatus(schedule,now=new Date(),done=false){
  if(done)return {tone:'complete',label:'Completed'};
  if(!schedule?.date)return {tone:'undated',label:'Add date'};
  const clock=localClock(now),date=schedule.date,time=schedule.time||'';
  const formatted=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
  const overdue=date<clock.date||(date===clock.date&&!!time&&time<clock.time);
  if(overdue)return {tone:'overdue',label:`Overdue · ${formatted}${time?' · '+time:''}`};
  if(date===clock.date)return {tone:'today',label:`Today · ${time||'no time set'}`};
  return {tone:'future',label:`${formatted}${time?' · '+time:''}`};
}
export function snoozeSchedule(preset,now=new Date()){
  if(preset==='hour')return localClock(new Date(now.getTime()+3600000));
  const days=preset==='tomorrow'?1:preset==='week'?7:0;if(!days)throw Error('Choose a snooze time.');
  return {date:new Date(Date.parse(localClock(now).date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10),time:'09:00'};
}
export function recordPeople(record){return [...new Set([...(record.people||[]),...(record.money?.person?[record.money.person]:[])].map(v=>String(v).trim()).filter(Boolean))];}
export function recordCategory(record){return record.category||record.space||'Uncategorized';}
export function recordClassification(record){const category=recordCategory(record);return record.space&&category.toLocaleLowerCase()!==record.space.toLocaleLowerCase()?record.space+' / '+category:category;}
export function relatedRecords(state,threadId){
  const isNote=threadId.startsWith('note:'),id=threadId.slice(threadId.indexOf(':')+1),record=(isNote?state.notes:state.groups).find(r=>r.id===id);
  if(!record)return {ancestors:[],children:[],category:'',people:[],categoryRecords:[],personRecords:{}};
  const all=[...state.groups.map(g=>({id:'group:'+g.id,record:g,title:g.title,kind:'task'})),...(state.notes||[]).map(n=>({id:'note:'+n.id,record:n,title:n.money?n.money.person+' · money owed':n.text.split('\n')[0].slice(0,70),kind:'note'}))];
  const ancestors=[],seen=new Set([isNote?'note:'+id:'group:'+id]);let parent=isNote?record.groupId:record.parentId;
  while(parent&&!seen.has('group:'+parent)){const node=all.find(r=>r.id==='group:'+parent);if(!node)break;ancestors.unshift(node);seen.add(node.id);parent=node.record.parentId;}
  const category=recordCategory(record),people=recordPeople(record),live=all.filter(r=>r.id!==threadId&&!r.record.archivedAt);
  return {ancestors,children:isNote?[]:live.filter(r=>(r.kind==='task'?r.record.parentId:r.record.groupId)===id),category,people,categoryRecords:live.filter(r=>recordCategory(r.record).toLocaleLowerCase()===category.toLocaleLowerCase()),personRecords:Object.fromEntries(people.map(person=>[person,live.filter(r=>recordPeople(r.record).some(p=>p.toLocaleLowerCase()===person.toLocaleLowerCase()))]))};
}
export function checklistLines(text){return splitList(text);}
