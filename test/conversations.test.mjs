import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReceivable,receivableFact,currencyCode} from '../capture.mjs';
import {threadMessages,conversationEntries,validateThread} from '../threads.mjs';

const empty=()=>({groups:[],notes:[],files:[],messages:[],undo:[]});
test('money owed is a note; missing currency is clarified without adding an outgoing task',()=>{
  for(const text of ['John need to pay me 500','John needs to pay me 500','John owes me 500']){
    const result=captureReceivable(empty(),text);
    assert.equal(result.next.groups.length,0);assert.equal(result.next.notes.length,1);assert.equal(result.next.notes[0].money.direction,'receivable');assert.equal(result.next.notes[0].money.amount,500);assert.equal(result.next.notes[0].money.currency,null);assert.match(result.reply.question.title,/currency/);assert.equal(result.threadId,'note:'+result.next.notes[0].id);
    const resolved=captureReceivable(result.next,'USD',result.threadId);assert.equal(resolved.next.notes.length,1);assert.equal(resolved.next.notes[0].money.currency,'USD');assert.equal(resolved.reply.question,null);assert.equal(resolved.next.groups.length,0);assert.equal(result.next.notes[0].money.currency,null);
  }
});
test('currency is never guessed from an ambiguous dollar symbol or language',()=>{
  assert.equal(receivableFact('John owes me $500').currency,null);
  assert.equal(receivableFact('John owes me 500 dollars').currency,null);
  assert.equal(receivableFact('John owes me 500 USD').currency,'USD');
  assert.equal(receivableFact('John owes me 500 shekels').currency,'ILS');
  assert.equal(currencyCode('Canadian dollars'),'CAD');
  assert.equal(currencyCode('INR'),'INR');assert.equal(currencyCode('it is USD'),'USD');assert.equal(currencyCode('yes'),null);
  assert.equal(receivableFact('ג׳ון חייב לי 500').currency,null);
  const hebrew=captureReceivable(empty(),"ג'ון צריך להחזיר לי 500");assert.equal(hebrew.next.notes[0].money.currency,null);assert.match(hebrew.reply.question.title,/מטבע/);assert.equal(hebrew.next.groups.length,0);
  const result=captureReceivable(empty(),'John owes me 500');
  const ambiguous=captureReceivable(result.next,'dollars',result.threadId);assert.ok(ambiguous.reply.question);assert.equal(ambiguous.next.notes[0].money.currency,null);
});
test('outgoing payments and reminder commands do not become receivable notes',()=>{
  for(const text of ['I need to pay John 500','Remind me John owes me 500','Does John owe me 500?','Maybe John owes me 500'])assert.equal(receivableFact(text),null);
});
test('task and note conversations stay separate and appear in the home list',()=>{
  const state={...empty(),groups:[{id:'school',title:'School',space:'Family',steps:[]}],notes:[{id:'n1',text:'John owes me 500',money:{person:'John',amount:500,currency:null}}],messages:[{role:'user',text:'Currency question',thread_id:'note:n1'},{role:'assistant',text:'Which currency?',question:{title:'Currency?'},thread_id:'note:n1'},{role:'user',text:'School update',thread_id:'group:school'},{role:'assistant',text:'General',thread_id:'inbox'}]};
  assert.deepEqual(threadMessages(state,'group:school').map(m=>m.text),['School update']);
  assert.deepEqual(threadMessages(state,'note:n1').map(m=>m.text),['Currency question','Which currency?']);
  assert.deepEqual(threadMessages(state,'inbox').map(m=>m.text),['General']);
  const entries=conversationEntries(state);assert.equal(entries.length,2);assert.equal(entries.some(e=>e.id==='inbox'),false);assert.equal(entries.find(e=>e.id==='note:n1').preview,'John owes me 500');assert.equal(entries.find(e=>e.id==='group:school').preview,'School');
  assert.throws(()=>validateThread(state,'note:missing'),/not found/);
});
