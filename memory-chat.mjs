import {changeMemory,memoryState,memoryKinds,entityTypes,attributes} from './memory.mjs';
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string={type:'string'};
export const memoryActionSchema=object({operation:{type:'string',enum:['save','forget','forget_profile','confirm','pause','resume','merge']},fact_id:string,entity_id:string,target_id:string,name:string,entity_type:{type:'string',enum:entityTypes},kind:{type:'string',enum:memoryKinds},attribute:{type:'string',enum:attributes},value:string});
export const memoryChatInstructions=`MEMORY CONTROLS: memory_actions are separate from task/note actions. Use them ONLY when the user directly asks to remember, correct/update personal knowledge, forget, confirm a known fact, merge duplicate people, or pause/resume automatic learning. Ordinary task instructions and questions about what you know do not authorize memory edits; return memory_actions=[]. When asked what you know, answer using the visible confirmed knowledge and mention What Woven knows for the full list. save writes a confirmed personal fact, with fact_id only for correcting that exact fact, entity_id for its exact profile, and name/entity_type/kind/attribute/value. forget requires the exact fact_id; forget_profile requires the exact entity_id. confirm requires fact_id. merge requires exact entity_id and target_id; do not merge without a direct user request. pause/resume changes automatic learning only. If the identity or scope of a deletion is unclear, ask one question with no memory_actions. Never delete original tasks, notes or messages through these actions. Unused string fields are empty; enum fields may use topic, Other, background as defaults. A forgotten fact is removed from memory and blocked from relearning; its original source remains unless separately deleted. Do not claim to delete source records. A user's explicit memory correction overrides older facts. Reply briefly with what was changed. Never copy private background into a new note as a side effect of a memory-only request.`;
export function applyMemoryActions(state,actions,userText){
  if(actions==null)return state;
  if(!Array.isArray(actions)||actions.length>8)throw Error('Invalid memory controls.');
  let next=state;
  const directed=/(?:remember|forget|memory|knowledge|learning|what you know|confirm|merge|you know|update.*(?:role|profile|fact)|correct.*(?:role|profile|fact)|זכור|זכרי|תזכור|תזכרי|תשכח|שכח|תשכחי|זיכרון|זכרון|ידע|תעדכן|תעדכני|תמזג|לאחד)/iu.test(userText);
  if(actions.length&&!directed)throw Error('A memory change needs a direct instruction.');
  for(const action of actions){
    if(!action||typeof action.operation!=='string')throw Error('Invalid memory action.');
    const memory=memoryState(next),fact=memory.facts.find(f=>f.id===action.fact_id),entity=memory.entities.find(e=>e.id===action.entity_id),target=memory.entities.find(e=>e.id===action.target_id);
    if(['pause','resume'].includes(action.operation)){next=changeMemory(next,{operation:'settings',enabled:action.operation==='resume'});continue;}
    if(action.operation==='merge'){next=changeMemory(next,{operation:'merge',entityId:entity?.id,targetId:target?.id,expected:entity?.updatedAt,targetExpected:target?.updatedAt});continue;}
    if(action.operation==='forget_profile'){next=changeMemory(next,{operation:'forget_profile',entityId:entity?.id,expected:entity?.updatedAt});continue;}
    if(['forget','confirm'].includes(action.operation)){next=changeMemory(next,{operation:action.operation,id:action.fact_id,expected:fact?.revision});continue;}
    if(action.operation!=='save')throw Error('Unknown memory action.');
    next=changeMemory(next,{operation:'save',id:action.fact_id||undefined,expected:fact?.revision,entityId:action.entity_id||undefined,name:action.name,entityType:action.entity_type,kind:action.kind,attribute:action.attribute,value:action.value});
  }
  return next;
}
