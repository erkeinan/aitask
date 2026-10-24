import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantSession,assistantHistory} from '../ai-session.mjs';
import {transcriptionForm} from '../voice.mjs';
import {buildRequest,initialState} from '../assistant.mjs';
const session='11111111-1111-4111-8111-111111111111';
test('AI-page conversation follows its session across tasks without mixing other captures',()=>{
 const messages=[{id:1,ai_session:session,thread_id:'group:a'},{id:2,thread_id:'group:a'},{id:3,ai_session:session,thread_id:'note:b'},{id:4,ai_session:'different'}];assert.deepEqual(assistantHistory({messages},session).map(m=>m.id),[1,3]);assert.equal(assistantSession({intent:'assistant_page',aiSession:session}),session);assert.throws(()=>assistantSession({intent:'assistant_page',aiSession:'bad'}));assert.equal(assistantSession({}),null);
});
test('AI guidance distinguishes conversation and proposals from requests to save changes',()=>{
 const request=buildRequest(initialState(),{intent:'assistant_page',text:'What should I focus on?'},'test');assert.match(request.instructions,/conversation only: return no saving actions/);assert.match(request.instructions,/include overdue items/);assert.match(request.instructions,/Ask before carrying out a proposed change/);assert.match(request.instructions,/update_note may use any exact existing note_id/);
});
test('voice transcription sends a bounded audio file as multipart without saving it',()=>{
 const form=transcriptionForm({mime:'audio/webm;codecs=opus',audio:Buffer.from('sample audio').toString('base64')});assert.equal(form.get('model'),'gpt-transcribe');assert.equal(form.get('file').name,'voice.webm');assert.equal(form.get('file').type,'audio/webm');assert.throws(()=>transcriptionForm({mime:'text/html',audio:'AAAA'}));assert.throws(()=>transcriptionForm({mime:'audio/webm',audio:'<bad>'}));assert.throws(()=>transcriptionForm({mime:'audio/webm',audio:'A'.repeat(14*1024*1024+1)}));
});
