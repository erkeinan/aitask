export const inboxThread='inbox';
export function recordCompleted(record){return !!record.completedAt||(Array.isArray(record.steps)&&record.steps.length>0&&record.steps.every(s=>s.done))||!!(record.isChecklist&&record.checklist?.length&&record.checklist.every(i=>i.done));}
export function validateThread(state,id='inbox'){
  if(id==='inbox')return id;
  if(typeof id!=='string')throw Error('Choose a conversation.');
  const kind=id.slice(0,id.indexOf(':')),key=id.slice(id.indexOf(':')+1);
  if(kind==='group'&&state.groups.some(g=>g.id===key))return id;
  if(kind==='note'&&(state.notes||[]).some(n=>n.id===key))return id;
  throw Error('This conversation was not found.');
}
export function threadMessages(state,id='inbox'){
  if(id==='inbox')return state.messages.filter(m=>!m.thread_id||m.thread_id==='inbox');
  const key=id.slice(id.indexOf(':')+1),group=id.startsWith('group:')?state.groups.find(g=>g.id===key):null;
  const selected=new Set();
  state.messages.forEach((m,i)=>{
    if(m.thread_id===id)selected.add(i);
    if(!m.thread_id&&group&&(m.actions?.some(a=>a.group_id===key)||String(m.text||'').toLocaleLowerCase().includes(group.title.toLocaleLowerCase()))){
      selected.add(i);if(m.role==='assistant'&&i>0&&!state.messages[i-1].thread_id)selected.add(i-1);
    }
  });
  if(group){
    const segments=[];let current=[];
    for(const message of state.messages.filter(m=>!m.thread_id)){
      const previous=current.at(-1);
      if(message.role==='user'&&current.length){
        const text=String(message.text||'').toLocaleLowerCase().trim(),options=previous?.question?.options||[];
        const choice=options.some(o=>[o.label,o.value].some(v=>String(v).toLocaleLowerCase().trim()===text));
        const short=!!previous?.question&&text.split(/\s+/).length<=4;
        if(!choice&&!short){segments.push(current);current=[];}
      }
      current.push(message);
    }
    if(current.length)segments.push(current);
    const relevant=new Set(segments.filter(segment=>segment.some(m=>m.actions?.some(a=>a.group_id===key)||String(m.text||'').toLocaleLowerCase().includes(group.title.toLocaleLowerCase()))).flat().map(m=>m.id).filter(Boolean));
    state.messages.forEach((m,i)=>{if(!m.thread_id&&relevant.has(m.id))selected.add(i);});
  }
  return state.messages.filter((_,i)=>selected.has(i));
}
export function threadInfo(state,id){
  if(id==='inbox')return {id,title:'Woven',subtitle:'Bring anything new',kind:'assistant'};
  const key=id.slice(id.indexOf(':')+1);
  if(id.startsWith('group:')){const group=state.groups.find(g=>g.id===key);if(group)return {id,title:group.title,subtitle:group.space||'Task',kind:'task',group};}
  if(id.startsWith('note:')){const note=(state.notes||[]).find(n=>n.id===key);if(note)return {id,title:note.money?note.money.person+' · money owed':note.text.split('\n')[0].slice(0,64),subtitle:note.money?(note.money.hasAmountUpdates?'Amounts recorded in note':`${note.money.amount} ${note.money.currency||'· currency needed'}`):'Saved note',kind:'note',note};}
  return null;
}
export function conversationEntries(state,{archived=false}={}){
  return [...state.groups.map(g=>'group:'+g.id),...(state.notes||[]).map(n=>'note:'+n.id)].map(id=>{
    const info=threadInfo(state,id),messages=threadMessages(state,id),last=messages.at(-1);
    const record=info.note||info.group;
    return {...info,record,preview:info.note?.text||(info.group?.steps||[]).filter(s=>!s.done).map(s=>s.title).join(' · ')||(info.group?.steps||[]).map(s=>s.title).join(' · ')||info.group?.description||info.title,at:record.updatedAt||record.createdAt||last?.at||'',pending:!!last?.question};
  }).filter(item=>(!!item.record.archivedAt||recordCompleted(item.record))===archived).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
