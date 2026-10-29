import {voiceLanguages,loadVoiceLanguages,saveVoiceLanguages} from './voice-preferences.mjs';
import {deviceGet,deviceSet,clearDevice,queueCapture,acknowledgeCaptures,withQueued} from './offline-store.mjs';
import {createDeviceAlerts} from './device-alerts.mjs';
import {requestJSON} from './network.mjs';
import {conversationEntries,threadInfo,threadMessages,recordCompleted} from './threads.mjs';
import {recordSchedule,stepSchedule,scheduleStatus,recordPeople,recordCategory,recordClassification,relatedRecords,localClock,checklistLines} from './task-model.mjs';
import {detectActions,actionKinds,actionHref,safeTarget,groupedEntries} from './task-intelligence.mjs';
import {preferences,sortedEntries,recurrenceLabel,detectRecurrence} from './productivity.mjs';
import {animateCelebration} from './celebration.mjs';
import {createAIPage} from './ai-page.mjs';
import {createKnowledgeEditor} from './knowledge-ui.mjs';

const $=s=>document.querySelector(s);
let state={groups:[],notes:[],files:[],messages:[],undo:[]},token='',connected=false,cloud=false,busy=false;
let active=null,filter='all',scope=null,pending=null,captureResult=null,attachment=null,uploadTarget=null;
let inlineSavePromise=null;
let aiPage,offlineMode=false,syncing=false,focusMode='';
function openCapture(mode='add'){if(!token){notice('Sign in once to load your private space.');return;}aiPage?.leave(true);active=null;focusMode=mode;document.body.dataset.captureMode=mode;$('#capture-stage').hidden=false;$('#capture-stage-title').textContent=mode==='search'?'Search or add':'Add something';$('#capture-stage-hint').textContent=mode==='search'?'Search saved items, or press ↑ to add something new.':'Choose Task or Note to save without AI. You can organize it later.';$('#focus-response').append($('#capture-response'));if(!connected&&$('#capture-kind').value==='auto')$('#capture-kind').value='task';renderHome();renderCapture();}
function closeCapture(){focusMode='';delete document.body.dataset.captureMode;$('#capture-stage').hidden=true;$('.home-panel').prepend($('#capture-response'));$('#capture-input').value='';pending=null;captureResult=null;render();}
async function manualCapture(text){const kind=$('#capture-kind').value==='note'?'note':'task';if(offlineMode||!navigator.onLine)return offlineCapture(text,kind);const op={id:crypto.randomUUID(),text,kind,at:new Date().toISOString()};error();setBusy(true,'Saving…');try{const result=await api('/api/capture/manual',{...op,threadId:'inbox'});state=result.state;$('#capture-input').value='';render();notice('Saved · organize it later from inside the item.');celebrate(kind);}catch(e){error(e.message);}finally{setBusy(false);}}
const alerts=createDeviceAlerts({api,getState:()=>token?state:{groups:[]},notice});
async function remember(){if(token&&!offlineMode)await deviceSet('snapshot',{state,cloud,at:Date.now()}).catch(()=>{});}
async function offlineCapture(text,selectedKind=null){if(!text){error('Write a task or note to save offline.');return;}const kind=selectedKind||await new Promise(resolve=>{const d=el('dialog'),form=el('form');form.method='dialog';d.append(el('h2','','Save offline'),el('p','','AI needs internet. Choose how to save this text. It will sync later.'));for(const [value,label]of [['task','Save as task'],['note','Save as note'],['cancel','Cancel']]){const b=el('button',value==='task'?'primary':'secondary',label);b.value=value;form.append(b);}d.append(form);document.body.append(d);d.onclose=()=>{resolve(d.returnValue);d.remove();};d.showModal();});if(!['task','note'].includes(kind))return;await queueCapture(text,kind);state=withQueued(state,await deviceGet('outbox')||[]);$('#capture-input').value='';render();notice('Saved on this device · waiting to sync.');celebrate(kind);}
async function reconnect(){if(syncing||busy||!navigator.onLine)return;syncing=true;try{await load();}catch{}finally{syncing=false;}}
window.addEventListener('online',reconnect);window.addEventListener('offline',()=>{offlineMode=true;notice('Offline · saved tasks are available. New tasks and notes will sync later.');});
createKnowledgeEditor({getState:()=>state,isBusy:()=>busy,isConnected:()=>connected,
  save:data=>mutate('/api/knowledge',{...data,threadId:'inbox'}),
  confirm:(title,message,label)=>ask(title,message,label),
  refresh:async()=>{const {response,data}=await requestJSON('/api/status');if(data.authRequired&&!data.authenticated){showLogin();throw Error('Please sign in again.');}if(!response.ok)throw Error(data.error||'Could not refresh knowledge.');if(!busy)state={...state,memory:data.state.memory};},
  openSource:async key=>{if(!key.startsWith('message:'))return openRecord(key);const message=state.messages.find(m=>m.id===key.slice(8));if(!message){notice('This source is no longer available.');return;}$('#relations-title').textContent='Original conversation message';$('#relations-body').replaceChildren(textNode(message.text),el('p','small',message.at||''));$('#relations-dialog').showModal();},
  deleteSource:key=>key.startsWith('message:')?mutate('/api/knowledge',{operation:'delete_source',sourceKey:key,confirmed:true,threadId:'inbox'}):mutate('/api/record/delete',{threadId:key,confirmed:true})
});
let viewMode='list';const collapsedGroups=new Set(),reviewedThisSession=new Set();try{viewMode=localStorage.getItem('woven-group-view')||'list';if(!['list','category','task'].includes(viewMode))viewMode='list';}catch{}
let prefs=preferences();try{prefs=preferences(JSON.parse(localStorage.getItem('woven-preferences')||'{}'));}catch{}
function applyPreferences(){document.documentElement.dataset.fontSize=prefs.fontSize;document.documentElement.dataset.theme=prefs.theme;document.documentElement.dataset.accent=prefs.accent;$('#sort-mode').value=prefs.sort;}
function savePreferences(){try{localStorage.setItem('woven-preferences',JSON.stringify(prefs));}catch{}applyPreferences();}
applyPreferences();
$('#appearance').setAttribute('aria-label','Settings');$('#settings').setAttribute('aria-label','AI connection');
function el(tag,className='',text){const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
function button(label,fn,className='plain'){const node=el('button',className,label);node.type='button';node.dataset.mutate='true';node.disabled=busy;node.onclick=async event=>{if(inlineSavePromise&&await inlineSavePromise===false)return;return fn(event);};return node;}
function textNode(text,className=''){const node=el('div',className,text);node.dir='auto';return node;}
function error(message=''){$('#error').textContent=message;document.querySelectorAll('.dialog-error').forEach(node=>node.remove());if(message)for(const dialog of document.querySelectorAll('dialog[open]')){const node=el('p','dialog-error',message);node.setAttribute('role','alert');dialog.append(node);}}
function notice(message=''){$('#notice').textContent=message;}
let celebrationTimer,noticeTimer,stopCelebration=()=>{},filingDraft=null,fileViewURL=null,pdfDocument=null,pdfRender=null;
function celebrate(kind){
  if(prefs.effect==='none')return;
  clearTimeout(celebrationTimer);stopCelebration();const node=$('#celebration');if(node.hidePopover&&node.matches(':popover-open'))node.hidePopover();node.hidden=false;node.classList.remove('pop');void node.offsetWidth;node.classList.add('pop');
  $('#celebration-icon').textContent=kind==='done'?'✓':kind==='note'?'✦':'★';$('#celebration-text').textContent=kind==='done'?'You did it!':kind==='note'?'Brilliant. Saved!':'Let’s make it happen!';$('#celebration-caption').textContent=kind==='done'?'One less thing on your mind.':kind==='note'?'A thought caught. Space cleared.':'Your next step is ready.';
  node.dataset.effect=prefs.effect;node.dataset.direction=prefs.direction;
  if(node.showPopover&&!node.matches(':popover-open'))node.showPopover();
  const duration=prefs.effect==='balloons'?4400:3600;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)stopCelebration=animateCelebration($('#confetti'),{effect:prefs.effect,direction:prefs.direction,duration});
  celebrationTimer=setTimeout(()=>{stopCelebration();if(node.hidePopover&&node.matches(':popover-open'))node.hidePopover();node.hidden=true;node.classList.remove('pop');},duration);
}
function setBusy(value,label='Saving…'){busy=value;$('#home-status').textContent=value?label:'';$('#capture-input').disabled=value;const progress=$('#detail-progress');progress.hidden=!value||!active;progress.textContent=value?label:'';document.querySelectorAll('[data-mutate],.open-record,.home-filter,.inline-editor,.update-form textarea,#capture-send,#capture-attach,#settings,#signout,#view-mode,#sort-mode').forEach(node=>node.disabled=value);aiPage?.syncBusy();}
async function api(path,data={}){
  const threadId=data.threadId||(data.noteId?'note:'+data.noteId:data.groupId?'group:'+data.groupId:active||'inbox');
  const {response,data:result}=await requestJSON(path,{method:'POST',headers:{'Content-Type':'application/json','X-Woven-Token':token},body:JSON.stringify({...data,threadId})});
  if(response.status===401&&result.authRequired){await deviceSet('snapshot',null).catch(()=>{});showLogin();}
  if(result.connectAI)$('#setup').hidden=false;
  if(!response.ok)throw Error(result.error||'Could not save this change.');if(result.state&&!offlineMode)await deviceSet('snapshot',{state:result.state,cloud,at:Date.now()}).catch(()=>{});return result;
}
async function mutate(path,data={},message=''){
  if(offlineMode||!navigator.onLine){error('This change needs internet. You can view saved items and add new tasks or notes offline.');return null;}
  if(inlineSavePromise&&await inlineSavePromise===false)return null;
  if(busy)return null;error();setBusy(true);
  let result;const previous=state;
  try{result=await api(path,data);state=result.state;render();notice(message);if(message){clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice(),2800);}
    if((state.groups.some(g=>g.steps.some(s=>s.done&&!previous.groups.find(p=>p.id===g.id)?.steps.find(p=>p.id===s.id)?.done))||state.notes.some(n=>n.checklist?.some(i=>i.done&&!previous.notes.find(p=>p.id===n.id)?.checklist?.find(p=>p.id===i.id)?.done)))&&!result.archiveCandidates?.length)celebrate('done');
  }
  catch(e){error(e.message);render();return null;}
  finally{setBusy(false);}
  await offerArchive(result.archiveCandidates||[]);if(result.archiveCandidates?.length)celebrate('done');return result;
}
function setActive(id){active=id&&threadInfo(state,id)?id:null;history.replaceState(null,'',location.pathname+(active?'#'+encodeURIComponent(active):''));render();}
async function openRecord(id){if(!busy){aiPage?.leave();error();notice();setActive(id);let info=threadInfo(state,id);if(info?.group&&!info.group.recurrence&&!info.group.recurrenceExplicit){const rule=detectRecurrence([info.group.title,...info.group.steps.map(s=>s.title),...(info.group.sources||[])].join('\n'));if(rule&&rule.frequency!=='none'){await mutate('/api/record/recurrence',{threadId:id,detect:true});info=threadInfo(state,id);}}if(connected&&info?.group&&!recordCompleted(info.group)&&!info.group.stepsReviewedAt&&!reviewedThisSession.has(id)){reviewedThisSession.add(id);analyzeTask(info);}}}
function home(){if(!busy){aiPage?.leave();closeCapture();setActive(null);}}
function filterBy(kind,value){scope={kind,value};filter='all';$('#capture-input').value='';home();}
function done(group){return recordCompleted(group);}
function dueButton(schedule,complete=false){const status=scheduleStatus(schedule,new Date(),complete);const node=button(status.label,()=>scheduleEditor(schedule),'due-chip '+status.tone);node.dataset.schedule=JSON.stringify(schedule);node.dataset.complete=String(complete);node.setAttribute('aria-label',schedule.title+': '+status.label+'. Change date or snooze');return node;}
function renderHome(){
  const query=focusMode==='search'?$('#capture-input').value.trim().toLocaleLowerCase():'',archived=filter==='archive';
  const entries=sortedEntries(conversationEntries(state,{archived}).filter(item=>{
    if(filter==='tasks'&&item.kind!=='task'||filter==='notes'&&item.kind!=='note')return false;
    if(scope?.kind==='category'&&recordCategory(item.record).toLocaleLowerCase()!==scope.value.toLocaleLowerCase())return false;
    if(scope?.kind==='person'&&!recordPeople(item.record).some(person=>person.toLocaleLowerCase()===scope.value.toLocaleLowerCase()))return false;
    return !query||(item.title+' '+item.preview+' '+recordCategory(item.record)+' '+recordPeople(item.record).join(' ')).toLocaleLowerCase().includes(query);
  }),prefs.sort);
  const list=focusMode==='search'?$('#search-results'):$('#record-list');list.replaceChildren();if(focusMode==='search'&&!query)return;
  const buckets=viewMode==='list'?[{key:'',label:'',entries}]:groupedEntries(entries,state,viewMode);
  for(const bucket of buckets){
  if(bucket.label){const heading=button(`${collapsedGroups.has(bucket.key)?'▸':'▾'} ${bucket.label} · ${bucket.entries.length}`,()=>{collapsedGroups.has(bucket.key)?collapsedGroups.delete(bucket.key):collapsedGroups.add(bucket.key);renderHome();},'group-heading');heading.setAttribute('aria-expanded',String(!collapsedGroups.has(bucket.key)));list.append(heading);if(collapsedGroups.has(bucket.key))continue;}
  for(const item of bucket.entries){
    const row=el('article','record-entry'+(active===item.id?' selected':''));
    const open=button('',()=>{if(row.dataset.swipeClick==='true'){row.dataset.swipeClick='false';return;}if(row.classList.contains('swiped')){row.classList.remove('swiped');return;}closeCapture();openRecord(item.id);},'open-record');open.setAttribute('aria-label',item.title+' · '+item.kind);
    const avatar=el('span','entry-avatar '+item.kind,item.kind==='note'?'≡':item.title.split(/\s+/).slice(0,2).map(w=>[...w][0]).join('').toUpperCase());
    const body=el('span','entry-body'),top=el('span','entry-top');top.append(textNode(item.title,'entry-title'),el('span','entry-kind',item.kind.toUpperCase()));body.append(top,textNode(item.preview,'entry-preview'));open.append(avatar,body);row.append(open);
    const meta=el('div','entry-meta');if(item.record.offlinePending)meta.append(el('span','offline-pending','Waiting to sync'));meta.append(el('span','entry-category',recordClassification(item.record)));
    if(item.kind==='task')meta.append(dueButton(recordSchedule(item.group),done(item.group)));
    else if(item.note.money)meta.append(el('span','note-amount',item.subtitle));
    if(item.group?.recurrence){const repeat=el('span','repeat-tag','↻');repeat.title=recurrenceLabel(item.group.recurrence);repeat.setAttribute('aria-label',repeat.title);meta.append(repeat);}
    if(archived)meta.append(el('span','archive-tag',recordCompleted(item.record)?'✓ Completed':'Archived'));row.append(meta);
    if(!archived)installSwipe(row,item);list.append(row);
  }
  }
  if(!entries.length)list.append(el('p','empty-list',query?'No matching items. Press Enter to add this.':archived?'Your archive is empty.':'Nothing here yet. Add something in the box above.'));
  document.querySelectorAll('.home-filter').forEach(node=>{const selected=node.dataset.filter===filter;node.classList.toggle('active',selected);node.setAttribute('aria-pressed',String(selected));});
  const live=conversationEntries(state);$('#record-count').textContent=live.filter(e=>e.kind==='task').length+' tasks · '+live.filter(e=>e.kind==='note').length+' notes';
  $('#retry-cleanup').hidden=!state.pendingFileDeletes?.length;
  $('#view-mode').value=viewMode;
  const context=$('#scope-filter');context.replaceChildren();context.hidden=!scope;if(scope)context.append(el('span','',`${scope.kind==='person'?'Person':'Category'}: ${scope.value}`),button('Clear',()=>{scope=null;renderHome();}));
}
function installSwipe(row,item){
  const front=el('div','record-front');while(row.firstChild)front.append(row.firstChild);const actions=el('div','swipe-actions');
  if(item.group)actions.append(button('◷ Snooze',()=>scheduleEditor(recordSchedule(item.group)),'swipe-snooze'),button('✓ Done',()=>mutate('/api/task/finish',{groupId:item.group.id}),'swipe-done'));
  else actions.append(button('Archive',()=>archiveItem(threadInfo(state,item.id)),'swipe-snooze'));
  const more=button('⋯',()=>{row.classList.toggle('swiped');more.setAttribute('aria-expanded',String(row.classList.contains('swiped')));},'row-more');more.setAttribute('aria-label','Actions for '+item.title);more.setAttribute('aria-expanded','false');front.append(more);row.append(actions,front);
  let gesture=null;
  front.onpointerdown=event=>{if(busy||event.button!==0||event.target.closest('button:not(.open-record)'))return;gesture={x:event.clientX,y:event.clientY,id:event.pointerId};};
  front.onpointermove=event=>{if(!gesture)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){gesture=null;return;}if(dx < -25){row.classList.add('swipe-peek');front.setPointerCapture(event.pointerId);}};
  front.onpointerup=event=>{if(!gesture)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;row.classList.remove('swipe-peek');if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3){row.classList.toggle('swiped',dx<0);more.setAttribute('aria-expanded',String(dx<0));row.dataset.swipeClick='true';setTimeout(()=>{row.dataset.swipeClick='false';},400);}};
  front.onpointercancel=()=>{gesture=null;row.classList.remove('swipe-peek');};
  row.onkeydown=event=>{if(event.key==='Escape'){row.classList.remove('swiped');more.setAttribute('aria-expanded','false');}};
}
function recordFiles(target){return state.files.filter(file=>target.noteId?file.noteId===target.noteId:file.groupId===target.groupId&&(!target.stepId||file.stepId===target.stepId));}
function appendFiles(parent,target){for(const file of recordFiles(target)){const row=el('div','record-file'),open=button('▣ '+file.name,()=>viewFile(file),'file-open');open.setAttribute('aria-label','View '+file.name);row.append(open,button('View',()=>viewFile(file),'plain'),button('Download',()=>download(file)));parent.append(row);}}
function checklistItem(parent,item,info,isNote){
  const row=el('label','checklist-row'),check=el('input');check.type='checkbox';check.checked=!!item.done;check.disabled=busy;check.dataset.mutate='true';check.setAttribute('aria-label',item.text||item.title);check.onchange=()=>mutate('/api/record/checklist',{threadId:info.id,operation:'toggle',itemId:item.id,done:check.checked});row.append(check,inlineEditor(info,item.text||item.title,item.id,'text',false,'Checklist item'));parent.append(row);
  if(!isNote)parent.append(dueButton(stepSchedule(info.group,item),!!item.done));
}
function addChecklistForm(parent,info){const form=el('form','add-checklist-item'),input=el('input');input.placeholder='Add a checklist item';input.setAttribute('aria-label','New checklist item');input.maxLength=1000;input.required=true;const add=button('Add',()=>{});add.type='submit';form.append(input,add);form.onsubmit=async event=>{event.preventDefault();const result=await mutate('/api/record/checklist',{threadId:info.id,operation:'add',text:input.value});if(result)input.value='';};parent.append(form);}
function checklistEditor(info){
  const record=info.note||info.group;if(record.checklist||record.checklistSplit)return mutate('/api/record/checklist',{threadId:info.id,operation:'enable'});
  const dialog=$('#checklist-dialog'),body=$('#checklist-body');body.replaceChildren();body.append(el('p','small','One item per line. Check the split before saving; the original wording is kept.'));
  const form=el('form','checklist-preview'),inputs=[];
  for(const step of info.note?[{id:'',title:record.text}]:record.steps){const label=el('label','',info.note?'Checklist items':step.title),input=el('textarea');input.value=checklistLines(step.title).join('\n');input.rows=Math.max(2,Math.min(6,checklistLines(step.title).length));input.required=true;input.maxLength=20000;input.setAttribute('aria-label',info.note?'Checklist items':'Items from '+step.title);label.append(input);form.append(label);inputs.push({stepId:step.id,input});}
  const save=button('Save checklist',()=>{},'primary');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();const parts=inputs.map(({stepId,input})=>({stepId,lines:input.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)}));const result=await mutate('/api/record/checklist',{threadId:info.id,operation:'enable',...(info.note?{lines:parts[0].lines}:{splitSteps:parts})},'Checklist ready.');if(result)dialog.close();};body.append(form);dialog.showModal();
}
function renderActionButtons(parent,info,step=null){
  const record=info.group||info.note,text=step?(step.text||step.title):record.text||record.title;
  const actions=detectActions(info.group&&!step?'':text,step?.actionLinks||record.actionLinks||[]),bar=el('div','task-actions');
  for(const action of actions){let href='';try{href=actionHref(action);}catch{}
    if(href){const link=el('a','action-link',actionKinds[action.type].label+' ↗');link.href=href;if(href.startsWith('https:')){link.target='_blank';link.rel='noopener noreferrer';}link.title=action.type==='cloud_file'?'Open this file to make the update':action.type==='whatsapp'?'Open chat; you send the message':actionKinds[action.type].label;bar.append(link,button('✎',()=>actionEditor(info,step,action),'edit-action'));bar.lastChild.setAttribute('aria-label','Edit '+actionKinds[action.type].label+' details');}
    else bar.append(button(actionKinds[action.type].label+'…',()=>actionEditor(info,step,action),'action-link'));
  }
  if(info.group&&!step||actions.length)bar.append(button('+ Action',()=>actionEditor(info,step,{type:'call',target:'',draft:''}),'add-action'));
  if(bar.children.length){parent.append(bar);if(actions.some(a=>a.type==='cloud_file'))parent.append(el('p','small','Open the cloud file to make your update.'));}
}
function actionEditor(info,step,action){
  const dialog=$('#action-dialog'),body=$('#action-body');body.replaceChildren();$('#action-title').textContent='Action · '+(step?.title||step?.text||info.title);
  const form=el('form','relations-form'),kind=el('select'),target=el('input'),draft=el('textarea'),targetLabel=el('label'),draftLabel=el('label','','Message draft · optional'),help=el('p','small');
  kind.setAttribute('aria-label','Action type');for(const [type,meta]of Object.entries(actionKinds)){const option=el('option','',meta.label);option.value=type;kind.append(option);}kind.value=action.type;target.value=action.target||'';target.required=true;target.maxLength=2000;draft.value=action.draft||'';draft.rows=3;draft.maxLength=4000;draft.setAttribute('aria-label','Message draft');target.setAttribute('aria-label','Action destination');
  const update=()=>{const meta=actionKinds[kind.value];targetLabel.textContent=meta.field;target.placeholder=meta.placeholder;target.type=['call','sms','whatsapp'].includes(kind.value)?'tel':kind.value==='email'?'email':['cloud_file','website'].includes(kind.value)?'url':'text';draft.hidden=draftLabel.hidden=!['email','sms','whatsapp'].includes(kind.value);help.textContent=kind.value==='cloud_file'?'This opens your cloud file for you to edit. Woven does not update the external file automatically.':['email','sms','whatsapp'].includes(kind.value)?'Opens a draft in your app. You review and send it yourself.':'Save the destination, then use the action button to open it.';};kind.onchange=()=>{target.value='';update();};update();
  form.append(el('label','','Action'),kind,targetLabel,target,draftLabel,draft,help);const save=button('Save action',()=>{},'primary');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();try{const destination=safeTarget(kind.value,target.value);const result=await mutate('/api/record/action',{threadId:info.id,stepId:step?.id||'',type:kind.value,target:destination,draft:draft.value},'Action ready.');if(result)dialog.close();}catch(e){error(e.message);}};body.append(form);dialog.showModal();
}
async function analyzeTask(info){
  if(busy||!info.group)return;if(!connected){$('#setup').hidden=false;return;}
  error();setBusy(true,'Finding useful steps…');
  try{const result=await api('/api/chat',{threadId:info.id,captureId:crypto.randomUUID(),newCapture:true,intent:'analyze_task',text:'Review this task and add any missing, clearly necessary steps. Keep simple tasks simple. Use action verbs and preserve supplied contact details and file links.'});state=result.state;render();if(state.messages.at(-1)?.question)notice('A detail is needed to plan this task. Choose “Answer planning question” in the task.');else notice('Steps reviewed.');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice(),3500);}catch(e){error(e.message);}finally{setBusy(false);}
}
function renderRelations(parent,info){
  const links=relatedRecords(state,info.id),section=el('section','relations-section');section.append(el('h3','','Connections'));
  const tree=el('nav','relation-tree');tree.setAttribute('aria-label','Main task relationship');tree.append(button('Your tasks',home));
  for(const ancestor of links.ancestors)tree.append(el('span','','›'),button(ancestor.title,()=>openRecord(ancestor.id)));
  tree.append(el('span','','›'),textNode(info.title,'current-tree-item'));section.append(tree);
  const chips=el('div','relation-chips');chips.append(button('Category · '+links.category,()=>filterBy('category',links.category),'relation-chip'));
  for(const person of links.people)chips.append(button('Person · '+person,()=>filterBy('person',person),'relation-chip'));
  chips.append(button('Edit connections',()=>relationsEditor(info),'plain small'));section.append(chips);
  if(links.children.length){section.append(el('h4','','Related tasks and notes'));const children=el('div','tree-children');for(const child of links.children)children.append(button((child.kind==='note'?'≡ ':'○ ')+child.title,()=>openRecord(child.id),'related-record'));section.append(children);}
  parent.append(section);
}
function renderDetail(){
  const info=active&&threadInfo(state,active);$('#workspace').dataset.open=String(!!info);const box=$('#record-body');box.replaceChildren();if(!info){active=null;return;}
  $('#detail-title').replaceChildren(info.group?inlineEditor(info,info.title,'','title',false,'Task title'):document.createTextNode(info.title));$('#detail-title').dir='auto';$('#detail-kind').textContent=info.kind==='task'?'Task':'Note';
  const record=info.group||info.note,toolbar=el('div','detail-toolbar');
  if(info.group){toolbar.append(button('🔔 Reminders',()=>reminderEditor(info),'secondary'));toolbar.append(dueButton(recordSchedule(info.group),done(info.group)));if(!record.archivedAt)toolbar.append(button(done(info.group)?'Reopen task':'Mark task done',()=>mutate('/api/task/finish',{groupId:record.id,reopen:done(info.group)}),'primary'));}
  toolbar.append(button(record.isChecklist?'Use plain list':'Make checklist',()=>record.isChecklist?mutate('/api/record/checklist',{threadId:info.id,operation:'disable'}):checklistEditor(info),'secondary'));
  if(info.group&&!recordCompleted(record))toolbar.append(button('Find steps',()=>analyzeTask(info),'plain'));
  if(info.group)toolbar.append(button('↻ '+recurrenceLabel(record.recurrence),()=>recurrenceEditor(threadInfo(state,info.id)),'plain repeat-control'));
  if(record.archivedAt||recordCompleted(record))toolbar.append(button('Restore to active',async()=>{const result=await mutate('/api/record/archive',{threadId:info.id,restore:true},'Restored.');if(result){filter='all';render();}},'primary'));
  else toolbar.append(button('Archive',()=>archiveItem(info),'plain'));
  if(record.archivedAt||recordCompleted(record))toolbar.append(button('Delete permanently',()=>deleteItem(info),'plain danger'));
  if(record.needsSegmentation)toolbar.append(button('Organize with AI',async()=>{if(!connected){$('#setup').hidden=false;return;}await mutate('/api/record/segment',{threadId:info.id},'Organization updated.');},'secondary'));box.append(toolbar);
  box.append(el('p','inline-hint','Tap any text to change it. Saves when you leave the field.'),el('p','inline-status',''));box.lastChild.id='inline-status';box.lastChild.setAttribute('role','status');
  const content=el('section','saved-content');
  if(info.note){
    if(record.isChecklist){for(const item of record.checklist||[])checklistItem(content,item,info,true);addChecklistForm(content,info);}
    else content.append(inlineEditor(info,record.text,'','text',true,'Note text'));
    if(record.money){content.append(el('div','money-status',info.subtitle));if(!record.money.currency)content.append(button('Choose currency',()=>resumeCapture(info.id),'secondary'));}
    renderActionButtons(content,info);content.append(button('Attach file',()=>chooseFile({noteId:record.id,groupId:record.groupId||'',stepId:record.stepId||''}),'plain'));appendFiles(content,{noteId:record.id});
  }else{
    for(const step of record.steps){const row=el('section','task-content-row');
      if(record.isChecklist)checklistItem(row,step,info,false);
      else{row.append(inlineEditor(info,step.title,step.id,'text',true,'Task text'));row.append(dueButton(stepSchedule(record,step),!!step.done));row.append(button(step.done?'Reopen':'Done',()=>mutate('/api/task/complete',{groupId:record.id,stepId:step.id,reopen:!!step.done}),'secondary'));}
      renderActionButtons(row,info,step);const target={groupId:record.id,stepId:step.id};row.append(button('Attach file',()=>chooseFile(target),'plain small'));appendFiles(row,target);content.append(row);
    }
    if(record.isChecklist)addChecklistForm(content,info);
    renderActionButtons(content,info);
    for(const note of state.notes.filter(n=>n.groupId===record.id&&!n.archivedAt))content.append(button('≡ '+note.text.split('\n')[0].slice(0,90),()=>openRecord('note:'+note.id),'related-record'));
    if(record.reminder)content.append(textNode('Reminder note: '+record.reminder,'reminder-note'));
    appendFiles(content,{groupId:record.id});
  }
  box.append(content);renderUpdates(box,info);if(info.group&&threadMessages(state,info.id).at(-1)?.question)box.append(button('Answer planning question',()=>resumeCapture(info.id),'secondary'));renderRelations(box,info);
}
function inlineEditor(info,text,stepId='',field='text',multiline=false,label='Text'){
  const input=el(multiline?'textarea':'input','inline-editor'+(field==='title'?' title-inline':''));input.value=text;input.dir='auto';input.maxLength=20000;input.setAttribute('aria-label',label);input.dataset.saved=text;
  if(multiline)input.rows=Math.max(2,Math.min(10,Math.ceil(text.length/55)+text.split('\n').length-1));
  input.onblur=()=>{const value=input.value.trim(),expected=input.dataset.saved;if(value===expected)return;
    const prior=inlineSavePromise||Promise.resolve(true);const saving=prior.then(async()=>{
      const status=$('#inline-status');if(status)status.textContent='Saving…';
      try{const result=await api('/api/record/text',{threadId:info.id,stepId,field,text:value,expected});state=result.state;input.dataset.saved=value;input.removeAttribute('aria-invalid');renderHome();updateHistory(info.id);const fresh=threadInfo(state,info.id);if(info.note&&active===info.id)$('#detail-title').textContent=fresh.title;const repeat=$('.repeat-control');if(info.group&&repeat)repeat.textContent='↻ '+recurrenceLabel(fresh.group.recurrence);const row=input.closest('.task-content-row');if(row){row.querySelectorAll('.task-actions').forEach(n=>n.remove());renderActionButtons(row,fresh,fresh.group.steps.find(s=>s.id===stepId));}if(status)status.textContent='Saved · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'}).format(new Date());return true;}
      catch(e){error(e.message);input.setAttribute('aria-invalid','true');if(status)status.textContent='Not saved. Your text is kept here; leave this field again to retry.';return false;}
    });inlineSavePromise=saving;saving.finally(()=>{if(inlineSavePromise===saving)inlineSavePromise=null;});
  };
  input.onkeydown=event=>{if(event.key==='Enter'&&(!multiline||event.ctrlKey||event.metaKey)){event.preventDefault();input.blur();}};return input;
}
function updateHistory(id){const box=$('#update-history'),info=threadInfo(state,id);if(!box||active!==id||!info)return;box.replaceChildren();for(const update of [...((info.group||info.note).updates||[])].reverse()){
  const entry=el('article','update-entry'),time=el('time','',new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',dateStyle:'medium',timeStyle:'short'}).format(new Date(update.at)));time.dateTime=update.at;entry.append(time,el('span','update-kind',update.kind==='edit'?'Text changed':update.kind==='repeat'?'Repeat schedule':'Update'),textNode(update.text,'update-text'));box.append(entry);
}if(!box.children.length)box.append(el('p','small','Your dated updates will appear here.'));}
function renderUpdates(parent,info){const section=el('section','updates-section');section.append(el('h3','','Updates'));const form=el('form','update-form'),input=el('textarea');input.placeholder='Add an update…';input.setAttribute('aria-label','Add an update');input.rows=2;input.maxLength=10000;input.required=true;const add=button('Add update',()=>{},'secondary');add.type='submit';form.append(input,add);form.onsubmit=async event=>{event.preventDefault();const result=await mutate('/api/record/update',{threadId:info.id,text:input.value},'Update added with date and time.');if(result)input.value='';};section.append(form);const history=el('div','update-history');history.id='update-history';section.append(history);parent.append(section);updateHistory(info.id);}
function selectControl(label,values,current){const wrapper=el('label','setting-field',label),select=el('select');select.setAttribute('aria-label',label);for(const [value,text]of values){const option=el('option','',text);option.value=value;select.append(option);}select.value=current;wrapper.append(select);return {wrapper,select};}
function preferencesEditor(){
  $('#main-menu').open=false;const body=$('#preferences-body');body.replaceChildren();const settings=[['voiceMode','Voice interaction',[['record','Record a message (recommended)'],['conversation','Hands-free conversation']]],['fontSize','Font size',[['small','Small'],['medium','Medium (default)'],['large','Large']]],['theme','Appearance',[['system','Use device setting'],['light','Light'],['dark','Dark']]],['accent','Accent color',[['sage','Sage green'],['ocean','Ocean blue'],['plum','Plum purple'],['amber','Warm amber'],['rose','Rose']]],['effect','Celebration style',[['confetti','Confetti'],['balloons','Floating balloons'],['stars','Stars'],['bubbles','Bubbles'],['none','Off']]],['direction','Effect direction',[['down','Top to bottom'],['up','Bottom to top']]]];
  for(const [key,label,options]of settings){const control=selectControl(label,options,prefs[key]);control.select.onchange=()=>{prefs=preferences({...prefs,[key]:control.select.value,...(key==='effect'&&control.select.value==='balloons'?{direction:'up'}:{})});if(key==='effect'&&control.select.value==='balloons')body.querySelector('[aria-label="Effect direction"]').value='up';savePreferences();};body.append(control.wrapper);}
  const languages=el('fieldset','voice-language-settings'),legend=el('legend','','Voice languages');languages.append(legend,el('p','small','Automatic recognizes any supported language. Choose several preferences to help recognition when you switch languages. The first selected language is used for the opening greeting.'));let selected=loadVoiceLanguages();const auto=el('input');auto.type='checkbox';auto.checked=!selected.length;const autoLabel=el('label','','Automatic · all languages');autoLabel.prepend(auto);languages.append(autoLabel);const choices=el('div','voice-language-choices');const sync=()=>{auto.checked=!selected.length;choices.querySelectorAll('input').forEach(input=>input.checked=selected.includes(input.value));saveVoiceLanguages(selected);};auto.onchange=()=>{selected=[];sync();};for(const [code,name]of voiceLanguages){const label=el('label','',name),check=el('input');check.type='checkbox';check.value=code;check.checked=selected.includes(code);check.onchange=()=>{selected=check.checked?[...selected,code]:selected.filter(v=>v!==code);sync();};label.prepend(check);choices.append(label);}languages.append(choices);body.append(languages);body.append(el('h3','','Task alerts'),el('p','small','Default: 10 minutes before a task is due. Change reminders inside each task. Dates without a time use 09:00 in Asia/Jerusalem. Enable alerts on every phone or computer you use.'),button('Enable alerts on this device',async()=>{try{await alerts.enable();}catch(e){error(e.message);}},'primary'),button('Disable alerts on this device',async()=>{try{await alerts.disable();}catch(e){error(e.message);}},'secondary'));
  body.append(button('Try celebration',()=>{if(prefs.effect==='none'){notice('Celebrations are switched off.');return;}$('#preferences-dialog').close();celebrate('done');},'primary'),el('p','small','Changes save automatically on this browser. Reduced-motion device settings are respected.'));$('#preferences-dialog').showModal();
}
function recurrenceEditor(info){
  const body=$('#recurrence-body');body.replaceChildren();const rule=info.group.recurrence,frequency=selectControl('Repeat',[['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']],rule?.frequency||'none'),interval=el('input'),label=el('label','setting-field','Every');interval.type='number';interval.min='1';interval.max='365';interval.value=rule?.interval||1;interval.setAttribute('aria-label','Repeat interval');label.append(interval);const weekday=selectControl('Day of week',[['','Use the task date'],...['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,i)=>[String(i),day])],rule?.weekday!=null?String(rule.weekday):'');
  const sync=()=>{label.hidden=frequency.select.value==='none';weekday.wrapper.hidden=frequency.select.value!=='weekly';};frequency.select.onchange=sync;sync();const form=el('form','relations-form');form.append(frequency.wrapper,label,weekday.wrapper,el('p','small','Completing this task keeps its history and creates the next occurrence. Set the first date using the task’s date button. Missed occurrences are skipped.'));const save=button('Save repeat schedule',()=>{},'primary');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();const rule={frequency:frequency.select.value,interval:Number(interval.value),...(frequency.select.value==='weekly'&&weekday.select.value!==''?{weekday:Number(weekday.select.value)}:{})};const result=await mutate('/api/record/recurrence',{threadId:info.id,rule},'Repeat schedule saved.');if(result)$('#recurrence-dialog').close();};body.append(form);$('#recurrence-dialog').showModal();
}
function render(){void remember();void alerts.tick();renderHome();renderDetail();renderCapture();aiPage?.render();}
function renderCapture(){
  const box=$('#capture-response');box.replaceChildren();box.hidden=!pending;
  if(pending){
    box.append(textNode(pending.question.title||pending.message,'capture-question'));
    const choices=el('div','capture-options');for(const option of pending.question.options||[])choices.append(button(option.label,()=>submitCapture(option.value,true),'secondary'));box.append(choices);
    if(pending.question.allow_date){const input=el('input');input.type='date';input.required=true;input.setAttribute('aria-label','Choose a date');const row=el('div','date-row');row.append(input,button('Use date',async()=>{if(!input.value)return input.reportValidity();const target=pending.question.date_target;if(target?.group_id){const result=await mutate('/api/task/date',{groupId:target.group_id,stepId:target.step_id||'',date:input.value});if(result){captureResult={text:'Date saved.',threadId:'group:'+target.group_id};pending=null;render();}}else submitCapture(input.value,true);},'primary'));box.append(row);}
    box.append(button('×',()=>{pending=null;captureResult=null;$('#capture-input').value='';render();},'plain dismiss-capture'));box.lastChild.setAttribute('aria-label','Dismiss question');
  }else if(captureResult?.showResponse){
    box.hidden=false;const details=el('details'),summary=el('summary','capture-summary',captureResult.text);details.append(summary,textNode(captureResult.text,'capture-answer'));box.append(details,button('×',()=>{captureResult=null;renderCapture();},'plain dismiss-capture'));box.lastChild.setAttribute('aria-label','Dismiss response');
  }
  $('#capture-hint').textContent=pending?'Answer above or type your reply here.':'Type to search · Press Enter to add';
}
async function submitCapture(supplied=null,followup=false){
  if(busy)return;const text=String(supplied??$('#capture-input').value).trim();if(!text&&!attachment)return;if(offlineMode||!navigator.onLine){if(attachment){error('Image understanding needs internet. Your attachment is kept for later.');return;}return offlineCapture(text,$('#capture-kind').value==='auto'?null:$('#capture-kind').value);}
  if(!attachment&&(!connected||$('#capture-kind').value!=='auto')&&!followup)return manualCapture(text);
  if(attachment&&!attachment.isImage){await startFiling(attachment,null,text);return;}
  const captureId=followup&&pending?pending.captureId:crypto.randomUUID(),threadId=followup&&pending?pending.threadId:'inbox';
  const staged=attachment,previous=state;captureResult=null;if(!followup)pending=null;error();setBusy(true,followup?'Saving your answer…':'Adding…');
  let result;
  try{
    result=await api('/api/chat',{text,image:staged?.data||null,threadId,captureId,newCapture:!followup});
    state=result.state;const last=state.messages.at(-1);pending=last?.question?{threadId:result.threadId||threadId,captureId,question:last.question,message:last.text}:null;
    captureResult=pending?null:{threadId:result.threadId,text:last?.text||'Saved.'};$('#capture-input').value='';attachment=null;$('#capture-preview').hidden=true;render();
    if(!pending&&(state.groups.some(g=>!previous.groups.some(p=>p.id===g.id))||state.notes.some(n=>!previous.notes.some(p=>p.id===n.id))||followup&&captureResult)){filter='all';scope=null;setActive(null);celebrate(result.threadId?.startsWith('note:')?'note':'task');}
    else if(!result.archiveCandidates?.length&&!pending&&state.groups.some(g=>g.steps.some(s=>s.done&&!previous.groups.find(p=>p.id===g.id)?.steps.find(p=>p.id===s.id)?.done)))celebrate('done');
    else if(captureResult&&JSON.stringify([previous.groups,previous.notes])===JSON.stringify([state.groups,state.notes])){captureResult.showResponse=true;renderCapture();}
  }catch(e){error(e.message);render();}
  finally{setBusy(false);$('#capture-input').focus();}
  if(result){const candidates=(result.archiveCandidates||[]).filter(item=>{const before=threadInfo(previous,item.threadId);return !before||!recordCompleted(before.group||before.note);});await offerArchive(candidates);if(candidates.length)celebrate('done');}
}
function resumeCapture(id){const last=threadMessages(state,id).at(-1);if(!last?.question)return;pending={threadId:id,captureId:last.capture_id||crypto.randomUUID(),question:last.question,message:last.text};captureResult=null;$('#capture-input').value='';home();$('#capture-input').focus();}
function ask(title,message,label='Archive',cancel='Cancel',destructive=false){
  return new Promise(resolve=>{const dialog=$('#confirm-dialog');dialog.classList.toggle('completion-dialog',title==='✓ Completed!');$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;$('#confirm-yes').textContent=label;$('#confirm-yes').className=destructive?'danger-button':'primary';$('#confirm-cancel').textContent=cancel;dialog.returnValue='cancel';dialog.onclose=()=>resolve(dialog.returnValue==='confirm');dialog.showModal();$('#confirm-cancel').focus();});
}
async function archiveItem(info){if(!await ask('Move to Archive?',`“${info.title}” will leave the main list. You can restore it from Archive.`))return;const result=await mutate('/api/record/archive',{threadId:info.id,confirmed:true},'Moved to Archive.');if(result&&active===info.id){active=null;history.replaceState(null,'',location.pathname);render();}}
async function deleteItem(info,silent=false){
  if(!await ask('Delete permanently?',`Delete “${info.title}” and its attached files? This cannot be undone. Related tasks and notes are kept separately.`,'Delete permanently','Cancel',true))return;
  const result=await mutate('/api/record/delete',{threadId:info.id,confirmed:true});
  if(result){if(!silent)celebrate('done');if(active===info.id)setActive(null);pending=null;captureResult=null;render();notice(result.cleanupPending?'Item deleted. File cleanup is pending — retry from the menu.':'Permanently deleted.');}
}
async function offerArchive(candidates){for(const item of candidates){const info=threadInfo(state,item.threadId);if(info&&!info.group?.archivedAt&&!info.note?.archivedAt){const next=info.group&&state.groups.find(g=>g.occurrenceOf===info.group.id);if(await ask('✓ Completed!',`“${item.title}” is now in Completed / Archive.`+(next?` Next occurrence: ${next.due}.`:'')+' Restore it anytime, or delete it permanently.','Delete permanently','Keep in Completed',true))await deleteItem(info,true);if(active===item.threadId)home();}}}
function scheduleEditor(schedule){
  if(busy)return;const dialog=$('#schedule-dialog'),body=$('#schedule-body');body.replaceChildren();$('#schedule-title').textContent=schedule.title;
  const quick=el('div','snooze-presets');for(const [preset,label] of [['hour','Snooze 1 hour'],['tomorrow','Tomorrow · 09:00'],['week','In a week · 09:00']])quick.append(button(label,async()=>{const result=await mutate('/api/task/snooze',{groupId:schedule.groupId,stepId:schedule.stepId,preset,snooze:true},'Snoozed.');if(result)dialog.close();},'secondary'));body.append(quick);
  const form=el('form','schedule-form'),date=el('input'),time=el('input');date.type='date';date.required=true;date.value=schedule.date||localClock().date;date.setAttribute('aria-label','Task date');time.type='time';time.value=schedule.time||'';time.setAttribute('aria-label','Task time (optional)');form.append(el('label','','Date'),date,el('label','','Time · optional'),time,button('Save date and time',()=>{},'primary'));form.lastChild.type='submit';form.onsubmit=async event=>{event.preventDefault();const result=await mutate('/api/task/date',{groupId:schedule.groupId,stepId:schedule.stepId,date:date.value,time:time.value},'Date updated.');if(result)dialog.close();};body.append(form,el('p','small','Snoozing changes the saved due date. It does not send a notification.'));dialog.showModal();
}
function reminderEditor(info){
  const dialog=$('#schedule-dialog'),body=$('#schedule-body');$('#schedule-title').textContent='Reminders · '+info.title;body.replaceChildren();
  const form=el('form','schedule-form'),chosen=new Set(info.group.reminderMinutes??[10]);
  for(const [value,label]of [[0,'At time of task'],[5,'5 minutes before'],[10,'10 minutes before'],[15,'15 minutes before'],[30,'30 minutes before'],[60,'1 hour before'],[120,'2 hours before'],[1440,'1 day before'],[10080,'1 week before']]){const check=el('input');check.type='checkbox';check.checked=chosen.has(value);check.onchange=()=>check.checked?chosen.add(value):chosen.delete(value);const line=el('label','reminder-option',label);line.prepend(check);form.append(line);}
  const custom=el('input');custom.type='number';custom.min='0';custom.max='40320';custom.placeholder='Custom minutes before';custom.setAttribute('aria-label','Custom reminder in minutes');const add=button('Add custom reminder',()=>{const n=Number(custom.value);if(custom.value&&Number.isInteger(n)&&n>=0&&n<=40320){chosen.add(n);notice('Custom reminder added: '+n+' minutes before.');}},'secondary');
  for(const value of chosen)if(![0,5,10,15,30,60,120,1440,10080].includes(value)){const line=el('label','reminder-option',value+' minutes before'),check=el('input');check.type='checkbox';check.checked=true;check.onchange=()=>check.checked?chosen.add(value):chosen.delete(value);line.prepend(check);form.append(line);}
  form.append(custom,add);const save=button('Save reminders',()=>{},'primary');save.type='submit';form.append(save);form.onsubmit=async e=>{e.preventDefault();if(custom.value)chosen.add(Number(custom.value));const result=await mutate('/api/task/reminders',{groupId:info.group.id,minutes:[...chosen]},'Reminders saved.');if(result)dialog.close();};body.append(form,el('p','small','Choose up to five reminders, or untick all for none. Enable device alerts in Settings.'));dialog.showModal();
}
function relationsEditor(info){
  const dialog=$('#relations-dialog'),body=$('#relations-body'),record=info.group||info.note;body.replaceChildren();$('#relations-title').textContent='Connections · '+info.title;
  const form=el('form','relations-form'),category=el('input'),people=el('input'),parent=el('select'),segment=selectControl('Segment',[['','Unassigned / keep current'],['Work','Work'],['Personal','Personal'],['Family','Family']],record.space||'');category.value=recordCategory(record)==='Uncategorized'?'':recordCategory(record);category.maxLength=100;category.setAttribute('aria-label','Category');people.value=recordPeople(record).join(', ');people.placeholder='John, Maya';people.setAttribute('aria-label','People (comma separated)');parent.setAttribute('aria-label','Main task');const none=el('option','','None');none.value='';parent.append(none);for(const group of state.groups.filter(g=>g.id!==info.group?.id)){const option=el('option','',group.title);option.value=group.id;parent.append(option);}parent.value=info.note?record.groupId||'':record.parentId||'';
  form.append(segment.wrapper,el('label','','Category'),category,el('label','','Related people · separate with commas'),people,el('label','','Main task'),parent);const save=button('Save connections',()=>{},'primary');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();const result=await mutate('/api/record/relations',{threadId:info.id,category:category.value,space:segment.select.value,people:people.value.split(',').map(p=>p.trim()).filter(Boolean),parentId:parent.value},'Connections saved.');if(result)dialog.close();};body.append(form);dialog.showModal();
}
function chooseFile(target=null){uploadTarget=target;$('#file').click();}
async function fileData(file){if(file.size>10*1024*1024)throw Error('Use a file smaller than 10 MB.');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read the file.'));reader.onload=()=>resolve({name:file.name,data:reader.result,isImage:/^image\/(png|jpeg|webp|gif)$/.test(file.type)});reader.readAsDataURL(file);});}
async function stage(file){if(!file)return;const target=uploadTarget;uploadTarget=null;try{const data=await fileData(file);openCapture('file');await startFiling(data,target,$('#capture-input').value.trim());}catch(e){error(e.message);}}
function filingOptions(){return [...state.groups.map(g=>({id:'group:'+g.id,label:'Task · '+g.title+(g.archivedAt||recordCompleted(g)?' · completed':''),target:{groupId:g.id}})),...state.notes.map(n=>({id:'note:'+n.id,label:'Note · '+n.text.split('\n')[0].slice(0,80),target:{noteId:n.id,groupId:n.groupId||'',stepId:n.stepId||''}}))];}
async function startFiling(data,target=null,caption=''){
  if(busy)return;const dialog=$('#filing-dialog'),body=$('#filing-body'),draft={data,target,caption};filingDraft=draft;body.replaceChildren(el('p','','Reading '+data.name+'…'));dialog.showModal();setBusy(true,'Finding where this file belongs…');
  let analysis;try{analysis=(await api('/api/files/analyze',{threadId:'inbox',name:data.name,data:data.data.split(',')[1]})).analysis;}catch(e){analysis={readStatus:'Could not analyze this file. Choose where to keep it.',suggestions:[],summary:''};error(e.message);}finally{setBusy(false);}
  if(filingDraft!==draft||!dialog.open)return;body.replaceChildren(el('strong','filing-name',data.name),el('p','small',analysis.readStatus));
  if(analysis.summary){const summary=el('details','filing-summary');summary.append(el('summary','','Content summary'),textNode(analysis.summary));body.append(summary);}
  const options=filingOptions(),selected=target?.noteId?'note:'+target.noteId:target?.groupId?'group:'+target.groupId:analysis.suggestions?.[0]?.threadId||'';
  const control=selectControl('Keep with',[['','Separate file note'],...options.map(o=>[o.id,o.label])],selected),form=el('form','filing-form');form.append(control.wrapper);
  for(const suggestion of analysis.suggestions||[]){const choice=button('Suggested · '+suggestion.title,()=>{control.select.value=suggestion.threadId;},'filing-suggestion');choice.title=suggestion.reason;form.append(choice,el('p','small',suggestion.reason));}
  const filingCategory=el('input');filingCategory.value=/receipt|invoice|קבלה|חשבונית/i.test(data.name+' '+analysis.summary)?'Receipts':'Documents';filingCategory.maxLength=100;filingCategory.setAttribute('aria-label','File category');form.append(el('label','','Category for a separate file note'),filingCategory);
  const keep=el('input');keep.type='checkbox';keep.checked=true;keep.id='keep-original-file';const keepLabel=el('label','keep-file-option','Keep the original file too');keepLabel.prepend(keep);form.append(keepLabel,el('p','small','Untick to save only the extracted information. The original is stored only after you save.'));
  const save=button('Save information',()=>{},'primary');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();if(filingDraft!==draft)return;const selected=options.find(o=>o.id===control.select.value),destination=selected?.target||{},sameTask=target?.groupId&&destination.groupId===target.groupId&&!destination.noteId;
    const summary=[caption,analysis.summary||(!analysis.contentRead?'Contents have not been read.':data.name)].filter(Boolean).join('\n\n');
    if(!keep.checked&&!analysis.contentRead){error('This file has not been read. Connect AI to read images or PDFs, or keep the original for later.');return;}
    if(!keep.checked){const noteDestination=selected?.id?.startsWith('note:');const result=await mutate(noteDestination?'/api/record/update':'/api/notes',noteDestination?{text:'From '+data.name+'\n'+summary,threadId:selected.id}:{text:'From '+data.name+'\n'+summary,category:filingCategory.value,...destination,threadId:selected?.id||'inbox'});if(result){filingDraft=null;dialog.close();notice('Information saved. The original file was not kept.');celebrate('note');}return;}
    const result=await mutate('/api/files/upload',{...destination,...(sameTask?{stepId:target.stepId||''}:{}),threadId:selected?.id||'inbox',unfiled:!selected,name:data.name,data:data.data.split(',')[1],caption:summary||undefined,category:filingCategory.value,summary:analysis.summary||'',contentRead:!!analysis.contentRead});
    if(result){attachment=null;$('#capture-preview').hidden=true;$('#capture-input').value='';filingDraft=null;dialog.close();filter='all';scope=null;setActive(result.threadId==='inbox'?null:result.threadId);notice('Filed under '+(threadInfo(state,result.threadId)?.title||'saved files')+'.');}
  };body.append(form);
  if(analysis.contentRead)body.append(button('Use contents with AI · original not saved',()=>{attachment=null;$('#capture-kind').value='auto';$('#capture-input').value='Organize the following extracted file information into tasks or notes, and ask if anything is unclear. File: '+data.name+'\n'+analysis.summary;filingDraft=null;dialog.close();openCapture('add');$('#capture-input').focus();},'secondary'));
  if(data.isImage&&!target)body.append(button('Discuss image with AI',()=>{attachment=data;$('#capture-preview').hidden=false;$('#capture-filename').textContent=data.name;filingDraft=null;dialog.close();$('#capture-input').focus();},'plain'));
}
async function viewFile(file){
  const dialog=$('#file-view-dialog'),body=$('#file-view-body');if(fileViewURL){URL.revokeObjectURL(fileViewURL);fileViewURL=null;}$('#file-view-title').textContent=file.name;body.replaceChildren(el('p','','Opening file…'));dialog.showModal();
  try{const response=await fetch('/api/files/view',{method:'POST',headers:{'Content-Type':'application/json','X-Woven-Token':token},body:JSON.stringify({id:file.id,threadId:active||'inbox'}),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error((await response.json()).error);if(!dialog.open)return;body.replaceChildren();if(file.summary)body.append(el('h3','','Extracted information'),textNode(file.summary,'file-extracted-summary'));const kind=response.headers.get('X-Woven-Preview');
    if(kind==='text'){body.append(el('p','small','Text preview'),textNode(await response.text(),'file-text-preview'));}
    else if(kind==='image'){fileViewURL=URL.createObjectURL(await response.blob());const view=el('img','file-preview');view.alt=file.name;view.src=fileViewURL;body.append(view);}
    else if(kind==='pdf'){await renderPDF(body,await response.arrayBuffer());}
    else body.append(el('p','',(await response.json()).message));body.append(button('Download original',()=>download(file),'secondary'));
  }catch(e){body.replaceChildren(el('p','danger',e.message),button('Download original',()=>download(file),'secondary'));}
}
async function renderPDF(body,bytes){
  body.append(el('p','small','Opening PDF…'));const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
  const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',useSystemFonts:true}).promise;
  if(!$('#file-view-dialog').open){doc.destroy();return;}pdfDocument=doc;body.replaceChildren();let number=1;
  const controls=el('div','pdf-controls'),count=el('span'),canvas=el('canvas','pdf-page'),text=el('details','pdf-text'),pageText=el('div','file-text-preview');text.append(el('summary','','Page text'),pageText);const previous=button('← Previous',async()=>{number--;await draw();},'secondary'),next=button('Next →',async()=>{number++;await draw();},'secondary');controls.append(previous,count,next);canvas.setAttribute('role','img');body.append(controls,canvas,text);
  async function draw(){previous.disabled=next.disabled=true;count.textContent='Page '+number+' of '+doc.numPages;const page=await doc.getPage(number);if(pdfDocument!==doc)return;const natural=page.getViewport({scale:1}),width=Math.max(240,Math.min(body.clientWidth||800,1000)),viewport=page.getViewport({scale:Math.min(2,devicePixelRatio||1)*width/natural.width});canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);canvas.setAttribute('aria-label','PDF page '+number+' of '+doc.numPages);pdfRender=page.render({canvasContext:canvas.getContext('2d'),viewport});await pdfRender.promise;const contents=await page.getTextContent();pageText.textContent=contents.items.map(i=>i.str||'').join(' ');previous.disabled=number===1;next.disabled=number===doc.numPages;}
  await draw();
}
$('#file-view-dialog').addEventListener('close',()=>{if(fileViewURL){URL.revokeObjectURL(fileViewURL);fileViewURL=null;}pdfRender?.cancel();pdfRender=null;pdfDocument?.destroy();pdfDocument=null;$('#file-view-body').replaceChildren();});
$('#filing-dialog').addEventListener('close',()=>{filingDraft=null;});
async function download(file){try{const response=await fetch('/api/files/download',{method:'POST',headers:{'Content-Type':'application/json','X-Woven-Token':token},body:JSON.stringify({id:file.id,threadId:active||'inbox'}),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),link=el('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){error(e.message);}}
function showLogin(){aiPage?.reset();active=null;pending=null;captureResult=null;attachment=null;state={groups:[],notes:[],files:[],messages:[],undo:[]};token='';$('#record-list').replaceChildren();$('#record-body').replaceChildren();$('#capture-response').replaceChildren();$('#capture-input').value='';$('#capture-form').hidden=true;$('#workspace').hidden=true;$('#login').hidden=false;$('#setup').hidden=true;$('#signout').hidden=true;$('#connection').textContent='Private space · sign in';for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();}
async function load(){
  const {response,data}=await requestJSON('/api/status',{}, {timeoutMs:45000});if(!response.ok)throw Error(data.error||'Could not load Woven.');cloud=!!data.authRequired;
  if(cloud&&!data.authenticated){await deviceSet('snapshot',null).catch(()=>{});showLogin();return;}offlineMode=false;token=data.token;if(localStorage.getItem('woven-signout-pending')){await api('/api/auth/logout');localStorage.removeItem('woven-signout-pending');await clearDevice();showLogin();return;}state={notes:[],files:[],...data.state};const queued=await deviceGet('outbox').catch(()=>[])||[];if(queued.length){try{const synced=await api('/api/offline/sync',{operations:queued,threadId:'inbox'});state=synced.state;await acknowledgeCaptures(queued.map(op=>op.id));notice('Your offline items have synced.');}catch(e){state=withQueued(state,queued);notice('Offline additions are still on this device. '+e.message);}}if(state.segmentationVersion!==2){try{state=(await api('/api/segmentation/review',{threadId:'inbox'})).state;}catch{}}connected=!!data.connected;$('#capture-form').hidden=false;$('#login').hidden=true;$('#workspace').hidden=false;$('#setup').hidden=true;$('#signout').hidden=!cloud;$('#connection').textContent=connected?'● AI connected':'○ Connect AI';
  try{const requested=decodeURIComponent(location.hash.slice(1));active=requested!=='inbox'&&threadInfo(state,requested)?requested:null;}catch{active=null;}render();
}
aiPage=createAIPage({getVoiceMode:()=>prefs.voiceMode,completeFlow:offerArchive,getLanguages:loadVoiceLanguages,openSettings:preferencesEditor,requestSpeech:(messageId,signal,extra={})=>fetch('/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json','X-Woven-Token':token},body:JSON.stringify({messageId,threadId:'inbox',stream:true,...extra}),signal}),connectAI:()=>{$('#setup').hidden=false;$('#key').focus();},isAuthenticated:()=>!!token,isConnected:()=>connected,getState:()=>state,api,applyState:next=>{state=next;render();},isBusy:()=>busy,setBusy,openRecord,scheduleEditor,mutate,celebrate,onMode:opened=>{if(opened){focusMode='';$('#capture-stage').hidden=true;document.body.dataset.captureMode='voice';}else if(document.body.dataset.captureMode==='voice')delete document.body.dataset.captureMode;$('#workspace').classList.toggle('voice-open',opened);$('#home').setAttribute('aria-expanded',String(opened));}});
$('#home').setAttribute('aria-label','Open Woven AI');
$('#capture-form').onsubmit=event=>{event.preventDefault();if(aiPage.isOpen()){const text=$('#capture-input').value.trim();if(text){$('#capture-input').value='';aiPage.send(text);}return;}submitCapture(null,!!pending);};
$('#capture-input').oninput=()=>{if(aiPage.isOpen())return;if(!focusMode)openCapture('search');if(!pending)captureResult=null;if(active){active=null;history.replaceState(null,'',location.pathname);renderDetail();}renderHome();renderCapture();};
$('#capture-attach').onclick=()=>{openCapture('add');$('#capture-input').focus();};$('#focus-file').onclick=()=>chooseFile();$('#header-camera').onclick=()=>{openCapture('file');uploadTarget=null;$('#camera-file').click();};$('#camera-file').onchange=event=>{stage(event.target.files[0]);event.target.value='';};$('#capture-back').onclick=closeCapture;$('#capture-input').onpointerdown=()=>{if(!focusMode&&!aiPage.isOpen())openCapture('search');};$('#file').onchange=event=>{stage(event.target.files[0]);event.target.value='';};$('#remove-capture-file').onclick=()=>{attachment=null;$('#capture-preview').hidden=true;};
document.querySelectorAll('.home-filter').forEach(node=>node.onclick=()=>{filter=node.dataset.filter;renderHome();});
$('#view-mode').onchange=event=>{viewMode=event.target.value;collapsedGroups.clear();try{localStorage.setItem('woven-group-view',viewMode);}catch{}renderHome();};
$('#sort-mode').onchange=event=>{prefs=preferences({...prefs,sort:event.target.value});savePreferences();renderHome();};
$('#appearance').onclick=preferencesEditor;
$('#home').textContent='✳';$('#home').setAttribute('aria-label','Back to tasks');$('#home').onclick=()=>{aiPage.leave(true);closeCapture();};$('#header-mic').onclick=()=>{if(offlineMode||!navigator.onLine){openCapture('add');notice('Voice needs internet. You can type a task or note here.');return;}closeCapture();aiPage.toggleVoice();};$('#detail-back').onclick=home;$('#settings').onclick=()=>{$('#main-menu').open=false;$('#setup').hidden=!$('#setup').hidden;};$('#close-setup').onclick=()=>{$('#setup').hidden=true;};
$('#retry-cleanup').onclick=async()=>{const result=await mutate('/api/record/delete',{threadId:'inbox',cleanupOnly:true});if(result)notice(result.cleanupPending?'Some files could not be removed yet. Please try again later.':'File cleanup complete.');};
$('#disconnect-ai').onclick=async()=>{try{await api('/api/disconnect',{threadId:'inbox'});connected=false;$('#connection').textContent='○ AI disconnected';notice('AI connection removed. Tasks and notes still work.');}catch(e){error(e.message);}};
$('#connect-form').onsubmit=async event=>{event.preventDefault();if(busy)return;error();setBusy(true,'Connecting…');try{await api('/api/connect',{key:$('#key').value,threadId:'inbox'});$('#key').value='';connected=true;$('#connection').textContent='● AI connected';$('#setup').hidden=true;notice('AI connected. You can add tasks and notes from the main box.');}catch(e){error(e.message);}finally{setBusy(false);}};
$('#login-form').onsubmit=async event=>{event.preventDefault();$('#login-error').textContent='';$('#login-submit').disabled=true;try{await api('/api/auth/login',{email:$('#login-email').value,password:$('#login-password').value});$('#login-password').value='';await load();}catch(e){$('#login-password').value='';$('#login-error').textContent=e.message;}finally{$('#login-submit').disabled=false;}};
$('#signout').onclick=async()=>{if(offlineMode||!navigator.onLine){await clearDevice();localStorage.setItem('woven-signout-pending','1');showLogin();return;}try{await alerts.disable().catch(()=>{});await api('/api/auth/logout');await clearDevice();showLogin();}catch(e){error(e.message);}};
document.querySelectorAll('[data-close]').forEach(node=>node.onclick=()=>$('#'+node.dataset.close).close());
window.addEventListener('hashchange',()=>{if(!busy){try{const id=decodeURIComponent(location.hash.slice(1));if(id==='ai'){aiPage.show();return;}aiPage.leave();active=id!=='inbox'&&threadInfo(state,id)?id:null;render();}catch{home();}}});
document.addEventListener('paste',event=>{if(event.target!==$('#capture-input')||busy)return;const file=Array.from(event.clipboardData?.files||[])[0];if(file){event.preventDefault();uploadTarget=null;stage(file);}});
setInterval(()=>{if(!busy)for(const node of document.querySelectorAll('.due-chip[data-schedule]')){const schedule=JSON.parse(node.dataset.schedule),status=scheduleStatus(schedule,new Date(),node.dataset.complete==='true');node.textContent=status.label;node.className='due-chip '+status.tone;node.setAttribute('aria-label',schedule.title+': '+status.label+'. Change date or snooze');}},60000);
try{await load();if(location.hash==='#ai'&&token)aiPage.show();}catch(e){const saved=await deviceGet('snapshot').catch(()=>null);if(saved&&!localStorage.getItem('woven-signout-pending')){state=withQueued(saved.state,await deviceGet('outbox')||[]);cloud=saved.cloud;token='offline-device';offlineMode=true;connected=false;$('#capture-form').hidden=false;$('#workspace').hidden=false;$('#login').hidden=true;$('#signout').hidden=false;$('#connection').textContent='Offline';render();notice('Offline · showing items saved on this device. Add a task or note above.');}else error('Connect to the internet and sign in once to use Woven offline. '+e.message);}
