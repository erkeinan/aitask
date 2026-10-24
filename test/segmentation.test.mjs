import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRecord,normalizeCaptureActions,financialCreationReview} from '../segmentation.mjs';
import {addNote,setRelations} from '../records.mjs';
import {captureReceivable} from '../capture.mjs';
import {transcriptionForm,transcriptNeedsReview} from '../voice.mjs';
import {buildRequest} from '../assistant.mjs';
const state=()=>({groups:[{id:'site',title:'Client website',space:'Work',category:'Websites',steps:[],sources:[]}],notes:[{id:'loan',text:'Loan to John: 500 ILS',space:'Personal',category:'Loans',people:['John'],money:{person:'John',amount:500,currency:'ILS'}}],messages:[],files:[],undo:[]});
const action=(text,people=[])=>({type:'create_note',group_id:'',note_id:'',step_id:'',title:'',text,due:'',space:'',category:'',people});
const reply=actions=>({message:'Saved.',question:null,actions});
test('website work uses Work / Websites while explicit personal sites remain personal',()=>{
 assert.deepEqual(classifyRecord('Build the business website',{space:'Personal'}),{space:'Work',category:'Websites'});assert.deepEqual(classifyRecord('לעדכן אתר ללקוח',{space:'Personal'}),{space:'Work',category:'Websites'});assert.deepEqual(classifyRecord('Build a personal website for my hobby'),{space:'Personal',category:'Websites'});assert.equal(classifyRecord('Website redesign',{space:'Personal',category:'Marketing'}).category,'Marketing');
});
test('financial notes get a category and segment; references inherit their linked project',()=>{
 const original=state(),saved=addNote(original,{text:'I borrowed 500 ILS from David'}).notes.at(-1);assert.equal(saved.category,'Loans');assert.equal(saved.space,'Personal');const linked=addNote(original,{text:'Brand color is blue',groupId:'site'}).notes.at(-1);assert.equal(linked.category,'Websites');assert.equal(linked.space,'Work');assert.equal(original.notes.length,1);
 const fast=captureReceivable({...original,notes:[]},'John owes me 500 ILS');assert.equal(fast.next.notes[0].category,'Loans');assert.deepEqual(fast.next.notes[0].people,['John']);assert.equal(captureReceivable(original,'John owes me 300 ILS'),null);
});
test('one capture can contain website work and a loan without leaking categories between them',()=>{
 const actions=normalizeCaptureActions(state(),[{...action('Build the website'),type:'create_group',title:'Website',space:'Personal'},{...action('Loan to David 500 ILS'),people:['David']}],'Build a website and remember the loan to David');assert.equal(actions[0].space,'Work');assert.equal(actions[0].category,'Websites');assert.equal(actions[1].category,'Loans');assert.equal(actions[1].space,'Personal');
});
test('a related amount is clarified before a duplicate loan is saved or an ambiguous total is changed',()=>{
 const original=state(),review=financialCreationReview(original,reply([action('John owes me 300 ILS',['John'])]),'John owes me 300 ILS');assert.equal(review.actions.length,0);assert.equal(review.relationTarget,'note:loan');assert.deepEqual(review.question.options.map(o=>o.label),['Additional amount','Correct total','Separate loan']);assert.equal(original.notes[0].money.amount,500);
 const update={...action('300 ILS'),type:'update_note',note_id:'loan'};assert.ok(financialCreationReview(original,reply([update]),'300','note:loan'));assert.equal(financialCreationReview(original,reply([update]),'another 300','note:loan'),null);
});
test('separate loans and different people are not automatically merged',()=>{
 const original=state();assert.equal(financialCreationReview(original,reply([action('Loan to Maya 300 ILS',['Maya'])]),'Loan to Maya 300 ILS'),null);assert.equal(financialCreationReview(original,reply([action('Loan to John 300 ILS',['John'])]),'A separate loan to John for 300 ILS'),null);
 const changed=setRelations(original,{threadId:'group:site',category:'Websites',space:'Work'});assert.equal(changed.groups[0].space,'Work');
});
test('Hebrew voice has Hebrew/English hints, context and script checks without guessing Arabic commands',()=>{
 const sample={language:'he',mime:'audio/webm',audio:Buffer.from('test').toString('base64')};const form=transcriptionForm(sample,'gpt-transcribe','הלוואה לדוד');assert.deepEqual(form.getAll('languages[]'),['he','en']);assert.match(form.get('prompt'),/הלוואה לדוד/);assert.equal(form.has('language'),false);const legacy=transcriptionForm(sample,'whisper-1');assert.equal(legacy.get('language'),'he');assert.equal(legacy.has('languages[]'),false);assert.equal(transcriptionForm({...sample,language:'auto'}).has('languages[]'),false);assert.equal(transcriptNeedsReview('أحتاج إلى شراء الحليب','he'),true);assert.equal(transcriptNeedsReview('צריך לקנות חלב','he'),false);assert.equal(transcriptNeedsReview('Call John tomorrow','he'),false);assert.equal(transcriptNeedsReview('أحتاج الحليب','ar'),false);
});
test('spoken requests keep replies concise and include loan relationship instructions',()=>{
 const request=buildRequest(state(),{text:'another 300',voice:true},'gpt-4.1');assert.match(request.instructions,/under 35 words/);assert.match(request.instructions,/Work \/ Websites/);assert.match(request.instructions,/additional amount, corrected total, or separate loan/);assert.match(request.instructions,/Never silently add or replace balances/);
});
