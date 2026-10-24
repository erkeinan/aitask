export function assistantSession(input){
  if(input.intent!=='assistant_page')return null;
  if(typeof input.aiSession!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.aiSession))throw Error('Start a new AI conversation and try again.');
  return input.aiSession;
}
export function assistantHistory(state,session){return state.messages.filter(m=>m.ai_session===session).slice(-24);}
