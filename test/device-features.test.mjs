import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud} from '../cloud.mjs';
import {sessionCodec} from '../session-cookie.mjs';
import {dueReminders,zonedEpoch,reminderMinutes} from '../reminders.mjs';
import {syncCaptures} from '../offline-sync.mjs';
import {classifyRecord} from '../segmentation.mjs';
import {preferences} from '../productivity.mjs';
const owner='11111111-1111-4111-8111-111111111111',config={url:'https://test.supabase.co',key:'sb_publishable_test',owner};
test('encrypted login survives a new server instance and refreshes the browser cookie',async()=>{
 let now=0,refresh=0,cookie;const options={sessionSecret:'test-only-stable-secret',now:()=>now,fetcher:async(url)=>{if(url.includes('grant_type=refresh_token'))refresh++;return Response.json(url.includes('/token?')?{user:{id:owner},access_token:'a',refresh_token:'r',expires_in:3600}:{id:owner});}};
 const res={setHeader:(_,value)=>cookie=value};await createCloud(config,options).login({email:'test@example.test',password:'test'},res);const original=cookie;assert.match(cookie,/Max-Age=2592000/);
 now=3600001;const restarted=createCloud(config,options);const session=await restarted.authenticate({headers:{cookie:original.split(';')[0]}},res);assert.equal(session.userId,owner);assert.equal(refresh,1);assert.notEqual(cookie,original);
 await assert.rejects(createCloud(config,{...options,sessionSecret:'wrong'}).authenticate({headers:{cookie}}),{status:401});
 const codec=sessionCodec('test');const sealed=codec.seal({private:'secret'});assert.equal(codec.open(sealed).private,'secret');assert.equal(codec.open(sealed.slice(0,-4)+'xxxx'),null);
});
test('reminders use Jerusalem daylight saving and only unfinished scheduled tasks',()=>{
 assert.equal(new Date(zonedEpoch('2026-07-01','12:00')).toISOString(),'2026-07-01T09:00:00.000Z');assert.equal(new Date(zonedEpoch('2026-12-01','12:00')).toISOString(),'2026-12-01T10:00:00.000Z');
 const g={id:'g',title:'Call',due:'2026-12-01',dueTime:'12:00',steps:[{id:'s',title:'Call',done:false}],reminderMinutes:[10,60]};const now=zonedEpoch(g.due,g.dueTime)-10*60000;
 assert.equal(dueReminders({groups:[g]},now).length,1);assert.equal(dueReminders({groups:[{...g,archivedAt:'today'}]},now).length,0);assert.equal(dueReminders({groups:[{...g,steps:[{done:true}]}]},now).length,0);assert.equal(dueReminders({groups:[{...g,reminderMinutes:[]}]},now).length,0);
 assert.deepEqual(reminderMinutes([10,0,10]),[10,0]);assert.throws(()=>reminderMinutes([-1]));assert.throws(()=>reminderMinutes([0,1,2,3,4,5]));
});
test('offline synchronization is idempotent and merges new items without overwriting online edits',()=>{
 const initial={groups:[{id:'existing',title:'Edited online',steps:[]}],notes:[],messages:[],files:[]};const operations=[{id:'11111111-1111-4111-8111-111111111111',kind:'task',text:'Deploy app to Render',at:'2026-10-25T10:00:00Z'},{id:'22222222-2222-4222-8222-222222222222',kind:'note',text:'Reference note',at:'2026-10-25T10:00:00Z'}];
 const next=syncCaptures(initial,operations),twice=syncCaptures(next,operations);assert.deepEqual(next,twice);assert.equal(next.groups[0].title,'Edited online');assert.equal(next.groups[1].space,'Work');assert.equal(next.groups[1].category,'Development');assert.equal(next.notes.length,1);assert.equal(initial.notes.length,0);assert.throws(()=>syncCaptures(initial,[{...operations[0],id:'bad'}]));
});
test('development variants share a canonical Work category and fonts default to Medium',()=>{
 for(const text of ['Deploy the app','Fix the API bug','CRM development','פיתוח אפליקציה'])assert.deepEqual(classifyRecord(text,{space:'Personal',category:'work development'}),{space:'Work',category:'Development'});
 assert.equal(preferences().fontSize,'medium');assert.equal(preferences({fontSize:'large'}).fontSize,'large');assert.equal(preferences({fontSize:'invalid'}).fontSize,'medium');
});
