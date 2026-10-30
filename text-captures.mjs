// Captures remain separate from tasks/notes until AI has resolved their meaning.
export function saveTextCapture(state,input){
  if(typeof input.id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.id)||typeof input.text!=='string'||!input.text.trim()||input.text.length>20000)throw Error('Write up to 20,000 characters.');
  const next=structuredClone(state);next.pendingCaptures??=[];
  if(next.pendingCaptures.some(c=>c.id===input.id)||next.messages.some(m=>m.capture_id===input.id)||(next.processedCaptures||[]).includes(input.id))return next;
  next.pendingCaptures.push({id:input.id,text:input.text.trim(),at:new Date().toISOString(),status:'queued',threadId:'inbox'});return next;
}
export function resolveTextCapture(state,id,reply,threadId){
  if(!state.pendingCaptures?.some(c=>c.id===id))return state;
  const next={...state,pendingCaptures:state.pendingCaptures.filter(c=>c.id!==id)};
  if(reply.question){const original=state.pendingCaptures.find(c=>c.id===id);next.pendingCaptures.push({...original,status:'question',question:reply.question,message:reply.message,threadId});}
  else next.processedCaptures=[...new Set([...(state.processedCaptures||[]),id])].slice(-2000);
  return next;
}
