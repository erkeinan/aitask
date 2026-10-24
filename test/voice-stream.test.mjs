import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceOutput,createPauseDetector} from '../voice-turn.mjs';
import {transcriptionForm,transcriptNeedsReview} from '../voice.mjs';
import {normalizeLanguages,voiceGreeting,voiceLanguages} from '../voice-preferences.mjs';

function audioHarness(){const played=[];class Context{constructor(){this.state='running';this.currentTime=1;}resume(){return Promise.resolve();}createBuffer(channels,length,rate){const samples=new Float32Array(length);return {duration:length/rate,getChannelData:()=>samples,samples};}createBufferSource(){const source={connect(){},disconnect(){},start(time){played.push({time,source,samples:this.buffer.samples});},stop(){this.stopped=true;}};return source;}}return {played,output:createVoiceOutput({AudioContextClass:Context})};}

test('PCM playback starts before the reply finishes arriving and handles split 16-bit samples',async()=>{
 const {played,output}=audioHarness();await output.unlock();let stream;const body=new ReadableStream({start(controller){stream=controller;}});const playing=output.playPCM(body);stream.enqueue(new Uint8Array([0,64,0]));await new Promise(resolve=>setImmediate(resolve));assert.equal(played.length,1);assert.equal(played[0].samples[0],.5);stream.enqueue(new Uint8Array([128]));stream.close();await new Promise(resolve=>setImmediate(resolve));assert.equal(played.length,2);assert.equal(played[1].samples[0],-1);assert.ok(played[1].time>played[0].time);for(const {source}of played)source.onended();assert.equal(await playing,true);
});
test('ending streaming speech stops queued audio and cancels the download',async()=>{
 const {played,output}=audioHarness();await output.unlock();let controller,cancelled=false;const body=new ReadableStream({start(value){controller=value;},cancel(){cancelled=true;}});const pending=output.playPCM(body);controller.enqueue(new Uint8Array([1,0]));await new Promise(resolve=>setImmediate(resolve));output.stop();assert.equal(await pending,false);assert.equal(cancelled,true);assert.equal(played[0].source.stopped,true);
});
test('truncated PCM is rejected rather than treated as a complete reply',async()=>{
 const {output}=audioHarness();await output.unlock();await assert.rejects(output.playPCM(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();}})),/interrupted/);
});
test('automatic transcription has no forced language; multiple language hints preserve Arabic and other speech',()=>{
 const sample={mime:'audio/webm',audio:Buffer.from('voice').toString('base64')};assert.deepEqual(transcriptionForm(sample).getAll('languages[]'),[]);assert.deepEqual(transcriptionForm({...sample,languages:['he','es','fr','he']}).getAll('languages[]'),['he','es','fr']);assert.equal(transcriptNeedsReview('أحتاج إلى شراء الحليب'),false);assert.deepEqual(normalizeLanguages(['ja','he','ja']),['ja','he']);assert.throws(()=>normalizeLanguages(['bad-value']));assert.throws(()=>normalizeLanguages('he'));const detect=createPauseDetector(0);for(let t=50;t<=500;t+=50)detect(.04,t);assert.equal(detect(0,1300).end,false);assert.equal(detect(0,1400).end,true);
});
test('greeting uses the first selected language, with English when automatic is selected',()=>{
 assert.equal(voiceGreeting(),"I'm here.");assert.equal(voiceGreeting([]),"I'm here.");assert.equal(voiceGreeting(['he','en']),'אני כאן.');assert.equal(voiceGreeting(['es','he']),'Estoy aquí.');for(const [code]of voiceLanguages)assert.ok(voiceGreeting([code]).length>0);assert.throws(()=>voiceGreeting('he'));
});
