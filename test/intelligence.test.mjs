import test from 'node:test';
import assert from 'node:assert/strict';
import {splitList,detectActions,actionHref,safeTarget,groupedEntries} from '../task-intelligence.mjs';
import {changeChecklist,saveActionLink} from '../records.mjs';
import {applyActions,buildRequest} from '../assistant.mjs';
import {conversationEntries} from '../threads.mjs';
const state=()=>({groups:[{id:'shop',title:'Shopping',space:'Personal',steps:[{id:'items',title:'Buy: 2 milk, 3 bread and 1 kg chicken',due:'2026-10-25',done:false}],sources:[]},{id:'child',title:'Dinner groceries',parentId:'shop',space:'Family',steps:[]}],notes:[{id:'n',text:'Packing list:\nPassport, charger; 2 shirts\n- Macaroni and cheese',groupId:'shop'}],files:[{id:'file1',groupId:'shop',stepId:'items'}],undo:[],messages:[]});
test('list splitting handles commas, semicolons, numbering, Hebrew and compounds without breaking numbers or links',()=>{
  assert.deepEqual(splitList('Buy: 2 milk, 3 bread and 1 kg chicken'),['2 milk','3 bread','1 kg chicken']);
  assert.deepEqual(splitList('לקנות: 2 חלב, 3 לחם; 1 ק״ג עוף'),['2 חלב','3 לחם','1 ק״ג עוף']);
  assert.deepEqual(splitList('Shopping:\n- 2,000 apples\n- 1.5 kg rice'),['2,000 apples','1.5 kg rice']);
  assert.deepEqual(splitList('1. Milk 2. Bread 3. Eggs'),['Milk','Bread','Eggs']);
  assert.deepEqual(splitList('Buy macaroni and cheese, bread'),['macaroni and cheese','bread']);
  assert.deepEqual(splitList('Call John and send the invoice'),['Call John','send the invoice']);
  assert.deepEqual(splitList('להתקשר לג׳ון ולשלוח חשבונית'),['להתקשר לג׳ון','לשלוח חשבונית']);
  assert.deepEqual(splitList('לקנות חלב ולחם וביצים'),['חלב','לחם','ביצים']);
  assert.deepEqual(splitList('Buy: "salt, pepper", sauce (tomato, basil), eggs'),['"salt, pepper"','sauce (tomato, basil)','eggs']);
  assert.deepEqual(splitList('Open https://example.test/file?a=1,2'),['Open https://example.test/file?a=1,2']);
});
test('checklist conversion splits task steps, keeps dates and original IDs, and validates preview edits',()=>{
  const before=state(),next=changeChecklist(before,{threadId:'group:shop',operation:'enable'});
  assert.deepEqual(next.groups[0].steps.map(s=>s.title),['2 milk','3 bread','1 kg chicken']);assert.equal(next.groups[0].steps[0].id,'items');assert.equal(next.groups[0].steps[1].due,'2026-10-25');assert.equal(next.groups[0].steps[0].sourceTitle,before.groups[0].steps[0].title);assert.equal(next.files[0].stepId,'items');assert.equal(before.groups[0].steps.length,1);
  const enabled=changeChecklist(changeChecklist(next,{threadId:'group:shop',operation:'disable'}),{threadId:'group:shop',operation:'enable'});assert.deepEqual(enabled.groups[0].steps,next.groups[0].steps);
  assert.throws(()=>changeChecklist(before,{threadId:'group:shop',operation:'enable',splitSteps:[{stepId:'missing',lines:['a']}]}),/changed/);
  const note=changeChecklist(before,{threadId:'note:n',operation:'enable',lines:['Passport','Charger','Two shirts']});assert.equal(note.notes[0].text,before.notes[0].text);assert.equal(note.notes[0].checklist.length,3);
});
test('action detection prepares safe links and never invents contact details or sends messages',()=>{
  assert.equal(detectActions('Call Alex')[0].target,'');assert.equal(detectActions('Maya prefers email.').length,0);assert.equal(detectActions('John owes me 500').length,0);assert.equal(detectActions('Do not call John').length,0);
  assert.equal(detectActions('Please do not call John').length,0);assert.equal(detectActions('Call John on +12025550123 or +12025550124')[0].target,'');
  assert.equal(detectActions('Send WhatsApp to John who owes me 500')[0].type,'whatsapp');
  const chat=detectActions('Send WhatsApp to +1 (202) 555-0123')[0];assert.equal(chat.type,'whatsapp');assert.equal(actionHref({...chat,draft:'Hi & hello'}),'https://wa.me/12025550123?text=Hi%20%26%20hello');
  assert.equal(actionHref({type:'call',target:'+12025550123'}),'tel:+12025550123');
  assert.match(actionHref({type:'maps',target:'10 Main Street'}),/destination=10%20Main%20Street/);
  assert.equal(detectActions('Update cloud file https://docs.google.com/document/d/example')[0].type,'cloud_file');
  for(const link of ['javascript:alert(1)','data:text/html,x','https://user:password@example.test'])assert.throws(()=>safeTarget('cloud_file',link));
  assert.throws(()=>safeTarget('whatsapp','0501234567'),/country code/);assert.throws(()=>safeTarget('email','a@example.test?bcc=other@example.test'));
});
test('saved actions are scoped to one item and grouping supports categories and task trees',()=>{
  const before=state(),next=saveActionLink(before,{threadId:'group:shop',stepId:'items',type:'call',target:'+12025550123'});assert.equal(next.groups[0].steps[0].actionLinks[0].target,'+12025550123');assert.equal(before.groups[0].steps[0].actionLinks,undefined);assert.throws(()=>saveActionLink(before,{threadId:'group:shop',stepId:'missing',type:'call',target:'+12025550123'}));
  const entries=conversationEntries(before);assert.equal(groupedEntries(entries,before,'category').length,3);const tasks=groupedEntries(entries,before,'task');assert.equal(tasks.length,1);assert.equal(tasks[0].entries.length,3);assert.equal(tasks[0].label,'Shopping');
});
test('new tasks split explicit item lists and step reviews are limited to the active task in the prompt',()=>{
  const action={type:'create_group',group_id:'groceries',title:'Groceries',text:'Buy: milk, bread, eggs',due:'',space:'Personal'};
  const groups=applyActions(state(),[action]);assert.deepEqual(groups.at(-1).steps.map(s=>s.title),['milk','bread','eggs']);assert.ok(groups.at(-1).stepsReviewedAt);
  const request=buildRequest({...state(),activeThread:{id:'group:shop'}},{text:'Review steps',intent:'analyze_task'},'test');assert.match(request.instructions,/Review ONLY the active saved task/);assert.match(request.instructions,/FIRST real step/);assert.match(request.instructions,/Never invent contact details/);
});
