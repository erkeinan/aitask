import {classifyRecord} from './segmentation.mjs';
export function syncCaptures(state,operations){
  if(!Array.isArray(operations)||operations.length>500)throw Error('Too many offline items.');const next=structuredClone(state);next.notes??=[];
  for(const op of operations){if(!op||!/^[0-9a-f-]{36}$/i.test(op.id)||!['task','note'].includes(op.kind)||typeof op.text!=='string'||!op.text.trim()||op.text.length>20000||!Number.isFinite(Date.parse(op.at)))throw Error('Invalid offline capture.');
    if(next.groups.some(g=>g.id===op.id)||next.notes.some(n=>n.id===op.id))continue;
    const common={id:op.id,createdAt:op.at,...classifyRecord(op.text)};if(op.kind==='task')next.groups.push({...common,title:op.text.split('\n')[0].slice(0,160),sources:[op.text],steps:[{id:op.id+'-step',title:op.text,done:false}]});else next.notes.push({...common,text:op.text});
  }return next;
}
