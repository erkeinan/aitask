export function createKnowledgeEditor({getState,save,isBusy,isConnected,refresh,openSource,deleteSource,confirm}){
  const make=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
  const button=(label,fn,style='plain')=>{const n=make('button',label,style);n.type='button';n.dataset.mutate='true';n.onclick=async()=>{if(!isBusy())await fn();};return n;};
  const dialog=make('dialog');dialog.id='knowledge-dialog';dialog.setAttribute('aria-labelledby','knowledge-heading');
  const heading=make('div','','dialog-heading'),title=make('h2','What Woven knows');title.id='knowledge-heading';heading.append(title,button('×',()=>dialog.close()));heading.lastChild.setAttribute('aria-label','Close knowledge base');
  const intro=make('p','Your background, people and preferences. Review what Woven learns, correct a fact, or choose what it should forget.');
  const privacy=make('p','Relevant memory is sent to the AI with conversations. Learning also sends saved tasks, notes and user messages to the AI. Forgetting a fact keeps its original source unless you delete that too.','small');
  const controls=make('div','','knowledge-controls'),learning=make('p','','small'),tabs=make('div','','knowledge-tabs'),search=make('input'),review=make('select'),list=make('div'),form=make('form'),status=make('p');
  let editing=null,selectedProfile='',tab='recent',polling=false;
  form.className='knowledge-form';status.setAttribute('role','status');search.type='search';search.placeholder='Search people and facts…';search.setAttribute('aria-label','Search knowledge');search.className='knowledge-search';
  review.setAttribute('aria-label','Filter knowledge status');for(const [v,label]of [['current','Current facts'],['review','Needs review'],['all','Include previous facts']]){const option=make('option',label);option.value=v;review.append(option);}
  const enabled=make('input');enabled.type='checkbox';enabled.setAttribute('aria-label','Automatic learning');const toggle=make('label','Automatic learning ');toggle.prepend(enabled);
  enabled.onchange=async()=>{if(isBusy()){enabled.checked=!enabled.checked;return;}const result=await save({operation:'settings',enabled:enabled.checked});draw();if(result)status.textContent=enabled.checked?'Automatic learning resumed.':'Learning paused. Saved facts remain available.';};
  controls.append(toggle,button('Review existing tasks & notes',async()=>{if(await save({operation:'scan'})){status.textContent='Saved tasks, notes and user messages are queued for learning.';draw();}}),button('Add a fact',()=>{reset();form.hidden=false;name.focus();},'secondary'));
  for(const [id,label]of [['recent','Recently learned'],['people','People'],['me','About me'],['preferences','Preferences'],['other','Other']]){const n=button(label,()=>{tab=id;draw();});n.dataset.tab=id;tabs.append(n);}
  const field=(label,tag,max)=>{const wrapper=make('label',label),n=make(tag);if(max)n.maxLength=max;n.dir='auto';wrapper.append(n);form.append(wrapper);return n;};
  const options=(select,items)=>{for(const [v,label]of items){const n=make('option',label);n.value=v;select.append(n);}};
  form.append(make('h3','Add or correct a fact'));
  const profile=field('Profile','select'),kind=field('Section','select'),type=field('Profile type','select'),name=field('Name or topic','input',120),attribute=field('Fact type','select'),value=field('What should Woven know?','textarea',3000);
  options(kind,['About me','Family','Work','Preferences','Other'].map(v=>[v,v]));options(type,[['person','Person'],['self','Me'],['organization','Organization'],['topic','Topic']]);options(attribute,['background','relationship','role','organization','nickname','preference','occupation','location','contact'].map(v=>[v,v[0].toUpperCase()+v.slice(1)]));
  name.required=true;name.placeholder='e.g. Maya';value.required=true;value.rows=3;value.placeholder='e.g. Graphic designer';
  const submit=make('button','Save fact','primary');submit.type='submit';submit.dataset.mutate='true';
  const fillEntity=e=>{if(!e)return;selectedProfile=e.id;profile.value=e.id;name.value=e.name;kind.value=e.kind;type.value=e.type;};
  profile.onchange=()=>{selectedProfile=profile.value;fillEntity(getState().memory?.entities.find(e=>e.id===selectedProfile));};
  const reset=()=>{editing=null;selectedProfile='';form.reset();form.hidden=true;submit.textContent='Save fact';};form.append(submit,button('Cancel',reset));
  const explanation=make('details','','knowledge-explanation');explanation.append(make('summary','How learning works'),privacy);
  dialog.append(heading,intro,explanation,controls,learning,tabs,search,review,list,form,status);document.body.append(dialog);
  const forget=async fact=>{if(!await confirm('Forget this fact?','It will be removed from memory and blocked from automatic relearning. Original tasks, notes and messages remain.','Forget'))return;if(await save({operation:'forget',id:fact.id,expected:fact.revision})){if(editing?.id===fact.id)reset();draw();status.textContent='Forgotten. Original sources remain; this fact will not be automatically learned again.';}};
  const draw=()=>{
    const m=getState().memory||{enabled:true,entities:[],facts:[],evidence:[],jobs:[]};enabled.checked=m.enabled;
    const queued=m.jobs.filter(j=>j.status==='queued').length,failed=m.jobs.filter(j=>j.status==='failed').length;
    learning.textContent=!m.enabled?'Learning paused.':!isConnected()?'Connect AI to learn from saved items. You can still manage facts here.':queued?`${queued} saved item${queued===1?'':'s'} waiting to be reviewed.`:'Learning is up to date.';
    if(failed)learning.textContent+=` ${failed} item${failed===1?'':'s'} could not be reviewed. ${[...new Set(m.jobs.filter(j=>j.status==='failed').map(j=>j.error))].join(' ')}`;
    for(const n of tabs.children)n.setAttribute('aria-pressed',String(n.dataset.tab===tab));
    if(!editing){const previous=profile.value;profile.replaceChildren();options(profile,[['','New profile'],...m.entities.map(e=>[e.id,e.name+' · '+e.type])]);profile.value=previous;}
    list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();
    const matches=f=>review.value==='all'||(review.value==='review'?['pending','disputed'].includes(f.status):f.status!=='outdated');
    const searchable=(e,f)=>!query||[e.name,...e.aliases,f.attribute,f.value].join(' ').toLocaleLowerCase().includes(query);
    const entities=m.entities.filter(e=>{
      if(tab==='people'&&!['person','organization'].includes(e.type))return false;
      if(tab==='me'&&e.type!=='self'&&e.kind!=='About me')return false;
      if(tab==='preferences'&&!m.facts.some(f=>f.entityId===e.id&&f.attribute==='preference')&&e.kind!=='Preferences')return false;
      if(tab==='other'&&(e.type!=='topic'||['About me','Preferences'].includes(e.kind)))return false;
      return m.facts.some(f=>f.entityId===e.id&&matches(f)&&searchable(e,f));
    }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    if(!entities.length)list.append(make('p',review.value==='review'?'No facts need review.':'No matching facts yet. Add a fact or let Woven learn from your saved items.','knowledge-empty'));
    for(const entity of entities){
      const card=make('section','','knowledge-profile'),header=make('div','','knowledge-profile-heading');header.append(make('h3',entity.name),make('span',entity.type+' · '+entity.kind,'small'));card.append(header);
      if(entity.aliases.length)card.append(make('p','Also known as: '+entity.aliases.join(', '),'small'));
      for(const fact of m.facts.filter(f=>f.entityId===entity.id&&matches(f)&&searchable(entity,f)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){
        const row=make('article','','knowledge-entry'),badge=make('span',({confirmed:'Confirmed by you',active:'Learned from a clear statement',pending:'Needs review',disputed:'Conflicting fact · review',outdated:'Previous fact'})[fact.status],'knowledge-badge');badge.dataset.status=fact.status;
        row.append(make('strong',fact.attribute[0].toUpperCase()+fact.attribute.slice(1)),badge,make('p',fact.value),make('small','Updated '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Asia/Jerusalem'}).format(new Date(fact.updatedAt))));
        const sources=m.evidence.filter(e=>e.factId===fact.id);
        if(sources.length){const evidence=make('details');evidence.append(make('summary',`Learned from ${sources.length} source${sources.length===1?'':'s'}`));for(const source of sources){const sourceRow=make('div','','knowledge-source');sourceRow.append(make('small',source.title),make('blockquote',source.quote),button('Open source',()=>{dialog.close();return openSource(source.sourceKey);}),button('Forget + delete this source',async()=>{
          if(!await confirm('Forget and delete the original source?','This forgets the fact and permanently deletes the selected source. Direct attachments on a task or note are also removed. Other sources remain.','Delete source'))return;
          if(!await save({operation:'forget',id:fact.id,expected:fact.revision}))return;const result=await deleteSource(source.sourceKey);draw();status.textContent=result?'Fact forgotten and selected source deleted. Other sources remain.':'Fact forgotten. The source could not be deleted; open it to try deleting it.';
        }));evidence.append(sourceRow);}row.append(evidence);}else row.append(make('small',fact.origin==='manual'?'Saved by you.':'Original source is no longer available.'));
        const actions=make('div','','knowledge-fact-actions');actions.append(button('Edit',()=>{editing=fact;form.hidden=false;fillEntity(entity);attribute.value=fact.attribute;value.value=fact.value;submit.textContent='Save correction';value.focus();}));
        if(['pending','disputed','outdated'].includes(fact.status))actions.append(button('Confirm as current',async()=>{if(await save({operation:'confirm',id:fact.id,expected:fact.revision})){draw();status.textContent='Confirmed as current. Previous conflicting facts are kept as history.';}}));
        actions.append(button('Forget',()=>forget(fact)));row.append(actions);card.append(row);
      }
      const management=make('details','','knowledge-profile-controls');management.append(make('summary','Manage profile'),button('Add a fact about '+entity.name,()=>{reset();form.hidden=false;fillEntity(entity);value.focus();}));
      const candidates=m.entities.filter(e=>e.id!==entity.id&&e.type===entity.type);
      if(candidates.length){const merge=make('select');merge.setAttribute('aria-label','Merge '+entity.name+' into another profile');options(merge,candidates.map(e=>[e.id,e.name]));management.append(merge,button('Merge duplicate profiles',async()=>{const target=candidates.find(e=>e.id===merge.value);if(!await confirm('Merge these profiles?',`Combine “${entity.name}” into “${target.name}”? Names and facts will be kept. Conflicting facts need review.`,'Merge'))return;if(await save({operation:'merge',entityId:entity.id,targetId:target.id,expected:entity.updatedAt,targetExpected:target.updatedAt})){reset();draw();status.textContent='Profiles merged. Review conflicting facts.';}}));}
      management.append(button('Forget this entire profile',async()=>{if(!await confirm('Forget '+entity.name+'?','All facts in this profile will be forgotten and automatic relearning blocked. Original sources remain.','Forget profile'))return;if(await save({operation:'forget_profile',entityId:entity.id,expected:entity.updatedAt})){reset();draw();status.textContent='Profile forgotten. Original sources remain.';}}));card.append(management);list.append(card);
    }
  };
  form.onsubmit=async event=>{event.preventDefault();if(isBusy())return;const result=await save({operation:'save',...(editing?{id:editing.id,expected:editing.revision}:{}),...(selectedProfile?{entityId:selectedProfile}:{}),name:name.value,kind:kind.value,entityType:type.value,attribute:attribute.value,value:value.value});if(result){reset();draw();status.textContent='Saved. Woven will use this in your next conversation.';}};
  search.oninput=draw;review.onchange=draw;
  async function open(){if(isBusy())return;document.querySelector('#main-menu').open=false;reset();status.textContent='';draw();dialog.showModal();try{await refresh();if(dialog.open)draw();}catch(error){status.textContent=error.message;}}
  document.querySelector('#appearance').after(button('What Woven knows',open));document.querySelector('#ai-new').before(button('What Woven knows',open));
  setInterval(async()=>{if(!dialog.open||isBusy()||polling)return;polling=true;try{const before=JSON.stringify(getState().memory);await refresh();if(dialog.open&&JSON.stringify(getState().memory)!==before)draw();}catch(error){status.textContent=error.message;}finally{polling=false;}},4000);
  return {open};
}
