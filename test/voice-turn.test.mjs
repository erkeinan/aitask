import test from 'node:test';
import assert from 'node:assert/strict';
import {createPauseDetector,createVoiceOutput} from '../voice-turn.mjs';
test('spoken turns wait through initial quiet, detect speech, then finish after a pause',()=>{
 const detect=createPauseDetector(0,{pauseMs:1100});assert.equal(detect(0,2000).end,false);for(let t=2100;t<=2500;t+=50)assert.equal(detect(.04,t).end,false);assert.equal(detect(0,3500).end,false);assert.deepEqual(detect(0,3600),{heard:true,end:true,reason:'pause'});
});
test('silence and isolated clicks never submit an empty voice message',()=>{
 const silence=createPauseDetector(0,{pauseMs:1100});assert.deepEqual(silence(0,10000),{heard:false,end:true,reason:'no-speech'});const click=createPauseDetector(0,{pauseMs:1100});click(.5,20);assert.deepEqual(click(0,10000),{heard:false,end:true,reason:'no-speech'});
});
test('short thinking pauses keep listening and maximum length still finishes a turn',()=>{
 const detect=createPauseDetector(0,{pauseMs:1100});for(let t=50;t<1000;t+=50)detect(.025,t);assert.equal(detect(0,1950).end,false);detect(.025,2400);assert.equal(detect(0,3400).end,false);assert.equal(detect(.025,60000).reason,'limit');assert.equal(detect(.025,60001).end,true);
});
test('voice output is enabled at the user gesture and automatically starts after decoding the delayed reply',async()=>{
 const calls=[];let source;
 class Context{constructor(){this.state='suspended';}resume(){calls.push('resume');this.state='running';return Promise.resolve();}async decodeAudioData(){calls.push('decode');return {};}createBufferSource(){source={connect(){},disconnect(){},start(){calls.push('play');},stop(){}};return source;}}
 const output=createVoiceOutput({AudioContextClass:Context});await output.unlock();assert.deepEqual(calls,['resume']);const played=output.play(new ArrayBuffer(4));await Promise.resolve();assert.deepEqual(calls,['resume','decode','play']);source.onended();assert.equal(await played,true);
});
test('ending voice during audio preparation cancels the pending reply without playing it later',async()=>{
 let completeDecode,started=false;
 class Context{constructor(){this.state='running';}resume(){return Promise.resolve();}decodeAudioData(){return new Promise(resolve=>completeDecode=resolve);}createBufferSource(){started=true;return {};}}
 const output=createVoiceOutput({AudioContextClass:Context});await output.unlock();const pending=output.play(new ArrayBuffer(4));output.stop();completeDecode({});assert.equal(await pending,false);assert.equal(started,false);
});
