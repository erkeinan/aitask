import {normalDate,recordSchedule,localClock} from './task-model.mjs';
export const defaultPreferences={fontSize:'medium',theme:'system',accent:'sage',effect:'confetti',direction:'down',sort:'due'};
export function preferences(value={}){const result={...defaultPreferences};for(const [key,allowed]of Object.entries({fontSize:['small','medium','large'],theme:['system','light','dark'],accent:['sage','ocean','plum','amber','rose'],effect:['confetti','balloons','stars','bubbles','none'],direction:['down','up'],sort:['due','newest','oldest','title','tasks','notes']}))if(allowed.includes(value?.[key]))result[key]=value[key];return result;}
export function validateRecurrence(value){
  if(value==null||value.frequency==='none')return null;
  if(!value||!['daily','weekly','monthly','yearly'].includes(value.frequency)||!Number.isInteger(value.interval??1)||(value.interval??1)<1||(value.interval??1)>365)throw Error('Choose a valid repeat interval.');
  const rule={frequency:value.frequency,interval:value.interval??1};
  if(value.weekday!=null){if(value.frequency!=='weekly'||!Number.isInteger(value.weekday)||value.weekday<0||value.weekday>6)throw Error('Choose a valid weekday.');rule.weekday=value.weekday;}
  if(value.anchorDay!=null){if(!Number.isInteger(value.anchorDay)||value.anchorDay<1||value.anchorDay>31)throw Error('Choose a valid day.');rule.anchorDay=value.anchorDay;}
  return rule;
}
export function detectRecurrence(text){
  const raw=String(text||'');if(/\b(?:one.off|once only|not recurring|stop repeating|do not repeat)\b|חד פעמי|לא לחזור|להפסיק לחזור/iu.test(raw))return {frequency:'none'};
  const dayNames=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for(let i=0;i<7;i++)if(new RegExp('\\bevery\\s+'+dayNames[i]+'\\b','i').test(raw))return {frequency:'weekly',interval:1,weekday:i};
  const hebrewDays=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];for(let i=0;i<7;i++)if(new RegExp('כל\\s+(?:יום\\s+)?'+hebrewDays[i],'u').test(raw))return {frequency:'weekly',interval:1,weekday:i};
  const interval=raw.match(/\bevery\s+(\d{1,3})\s+(days?|weeks?|months?|years?)\b/i);if(interval&&Number(interval[1])>0&&Number(interval[1])<=365)return validateRecurrence({frequency:{day:'daily',week:'weekly',month:'monthly',year:'yearly'}[interval[2].toLowerCase().replace(/s$/,'')],interval:Number(interval[1])});
  for(const [frequency,pattern]of [['daily',/\b(?:daily|every day|each day)\b|כל יום|יומי/iu],['weekly',/\b(?:weekly|every week|each week)\b|כל שבוע|שבועי/iu],['monthly',/\b(?:monthly|every month|each month)\b|כל חודש|חודשי/iu],['yearly',/\b(?:yearly|annually|every year|each year)\b|כל שנה|שנתי/iu]])if(pattern.test(raw))return {frequency,interval:1};
  return null;
}
export function recurrenceLabel(rule){if(!rule)return 'Does not repeat';const unit={daily:'day',weekly:'week',monthly:'month',yearly:'year'}[rule.frequency];return rule.weekday!=null?'Every '+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][rule.weekday]:`Every ${rule.interval>1?rule.interval+' ':''}${unit}${rule.interval>1?'s':''}`;}
const dateString=date=>date.toISOString().slice(0,10);
export function nextRecurringDate(base,rule,today=localClock().date){
  rule=validateRecurrence(rule);if(!rule)return null;const start=normalDate(base)||today,origin=new Date(start+'T12:00:00Z'),anchor=rule.anchorDay||origin.getUTCDate();
  for(let count=1;count<=10000;count++){
    const next=new Date(origin),amount=count*rule.interval;
    if(rule.frequency==='daily'||rule.frequency==='weekly'){next.setUTCDate(origin.getUTCDate()+amount*(rule.frequency==='weekly'?7:1));if(rule.weekday!=null)next.setUTCDate(next.getUTCDate()+rule.weekday-next.getUTCDay());}
    else{next.setUTCDate(1);if(rule.frequency==='monthly')next.setUTCMonth(origin.getUTCMonth()+amount);else next.setUTCFullYear(origin.getUTCFullYear()+amount);const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();next.setUTCDate(Math.min(anchor,last));}
    const date=dateString(next);if(date>start&&date>today)return date;
  }
  throw Error('Choose a more recent start date for this repeating task.');
}
export function sortedEntries(entries,mode='due',now=new Date()){
  const time=item=>item.record.updatedAt||item.record.completedAt||item.record.createdAt||item.at||'';
  const due=item=>item.kind==='task'?recordSchedule(item.group,now):null;
  const key=item=>{const schedule=due(item);return schedule?.date?'0'+schedule.date+(schedule.time||'23:59'):item.kind==='task'?'1':'2';};
  return [...entries].sort((a,b)=>{if(mode==='due')return key(a).localeCompare(key(b))||time(b).localeCompare(time(a));if(mode==='title')return a.title.localeCompare(b.title);if(mode==='oldest')return time(a).localeCompare(time(b));if(mode==='tasks'||mode==='notes'){const first=mode==='tasks'?'task':'note';return Number(b.kind===first)-Number(a.kind===first)||key(a).localeCompare(key(b));}return time(b).localeCompare(time(a));});
}
