import {recordSchedule} from './task-model.mjs';
export function reminderMinutes(value){if(!Array.isArray(value)||value.length>5||value.some(n=>!Number.isInteger(n)||n<0||n>40320))throw Error('Choose up to five reminders between 0 and 40320 minutes before.');return [...new Set(value)].sort((a,b)=>b-a);}
export function zonedEpoch(date,time='09:00',zone='Asia/Jerusalem'){
  const target=Date.parse(date+'T'+(time||'09:00')+':00Z');if(!Number.isFinite(target))return NaN;
  let result=target;const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(result)).map(p=>[p.type,p.value]));const wall=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);result+=target-wall;}return result;
}
export function dueReminders(state,now=Date.now()){
  const events=[];
  for(const group of state.groups||[]){if(group.archivedAt||group.completedAt||group.steps?.length&&group.steps.every(s=>s.done))continue;const schedule=recordSchedule(group,new Date(now));if(!schedule.date)continue;const due=zonedEpoch(schedule.date,schedule.time||'09:00');
    for(const minutes of group.reminderMinutes??[10]){const at=due-minutes*60000;if(now>=at&&now<at+15*60000)events.push({key:group.id+':'+schedule.date+':'+(schedule.time||'09:00')+':'+minutes,title:group.title,body:(minutes?`Due in ${minutes} minutes`:'Due now')+' · '+schedule.date+' '+(schedule.time||'09:00'),url:'/#'+encodeURIComponent('group:'+group.id),at});}
  }return events;
}
