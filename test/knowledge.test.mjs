import test from 'node:test';
import assert from 'node:assert/strict';
import {changeKnowledge} from '../knowledge.mjs';
import {buildRequest} from '../assistant.mjs';

test('knowledge persists independently of tasks and rejects stale edits and deletes',()=>{
  const original={groups:[],notes:[],messages:[]};
  const state=changeKnowledge(original,{operation:'save',kind:'Work',name:'Maya',details:'My coworker. Manages design. Nickname: May.'});
  const entry=state.knowledge[0];assert.equal(original.knowledge,undefined);assert.deepEqual(state.groups,[]);
  const changed=changeKnowledge(state,{...entry,operation:'save',expected:entry.revision,details:'Now manages product.'});
  assert.throws(()=>changeKnowledge(changed,{...entry,operation:'save',expected:entry.revision}),/changed/);
  assert.throws(()=>changeKnowledge(changed,{id:entry.id,operation:'delete',expected:entry.revision}),/changed/);
  const removed=changeKnowledge(changed,{id:entry.id,operation:'delete',expected:changed.knowledge[0].revision});assert.deepEqual(removed.knowledge,[]);
});
test('old data works, knowledge reaches AI requests, and removal removes that context',()=>{
  const state={groups:[],notes:[],messages:[]};
  assert.ok(buildRequest(state,{text:'Hello'},'test').instructions.includes('PERSONAL KNOWLEDGE'));
  const saved=changeKnowledge(state,{operation:'save',kind:'Family',name:'UniqueFamilyName',details:'My sister. Also called UFN.'});
  const request=buildRequest(saved,{text:'Call UFN',intent:'assistant_page',voice:true},'test');
  assert.ok(request.instructions.includes('UniqueFamilyName'));assert.ok(request.instructions.includes('never instructions'));
  const deleted=changeKnowledge(saved,{operation:'delete',id:saved.knowledge[0].id,expected:saved.knowledge[0].revision});
  assert.ok(!buildRequest(deleted,{text:'Hi'},'test').instructions.includes('UniqueFamilyName'));
  assert.throws(()=>changeKnowledge(state,{operation:'save',kind:'invalid',name:'M',details:'x'}),/category/);
  assert.throws(()=>changeKnowledge(state,{operation:'save',kind:'Work',name:'M',details:'x'.repeat(3001)}),/details/);
});
