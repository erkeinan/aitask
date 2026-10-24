import {randomUUID} from 'node:crypto';
import {memoryContext} from './memory.mjs';

export const knowledgeKinds=['About me','Family','Work','Preferences','Other'];
export function changeKnowledge(state,input){
  const entries=state.knowledge||[];
  const previous=input.id?entries.find(entry=>entry.id===input.id):null;
  if(input.id&&!previous)throw new Error('This knowledge entry no longer exists. Reopen the knowledge base.');
  if(previous&&input.expected!==previous.revision)throw new Error('This entry changed. Close and reopen the knowledge base before editing it.');
  if(input.operation==='delete'){
    if(!previous)throw new Error('Choose an entry to remove.');
    return {...state,knowledge:entries.filter(entry=>entry.id!==input.id)};
  }
  if(input.operation!=='save')throw new Error('Unknown knowledge operation.');
  if(!knowledgeKinds.includes(input.kind))throw new Error('Choose a knowledge category.');
  for(const [key,limit]of [['name',120],['details',3000]]){
    if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>limit)throw new Error(`Enter ${key} (up to ${limit} characters).`);
  }
  if(!previous&&entries.length>=100)throw new Error('You can keep up to 100 knowledge entries. Edit or remove an existing entry first.');
  const entry={id:previous?.id||randomUUID(),kind:input.kind,name:input.name.trim(),details:input.details.trim(),revision:randomUUID(),updatedAt:new Date().toISOString()};
  return {...state,knowledge:previous?entries.map(item=>item.id===entry.id?entry:item):[...entries,entry]};
}

export function knowledgeContext(state,query=''){
  return memoryContext(state,query);
}
