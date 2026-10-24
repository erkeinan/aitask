// Silence ends a spoken turn only after sustained speech, never on initial quiet.
export function createPauseDetector(start,{threshold=.012,pauseMs=900,noSpeechMs=10000,maxMs=60000}={}){
  let previous=start,lastVoice=start,speechMs=0,heard=false;
  return (level,now)=>{const dt=Math.max(0,Math.min(100,now-previous));previous=now;if(level>=threshold){speechMs+=dt;lastVoice=now;if(speechMs>=180)heard=true;}
    return {heard,end:now-start>=maxMs||heard&&now-lastVoice>=pauseMs||!heard&&now-start>=noSpeechMs,reason:now-start>=maxMs?'limit':heard?'pause':'no-speech'};};
}

export function watchVoice(stream,{onLevel,onEnd,onUnavailable,audioContext=null,AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
  if(!audioContext&&!AudioContextClass)return null;
  let context,source,frame=0,closed=false;
  const stop=()=>{closed=true;cancelAnimationFrame(frame);try{source?.disconnect();}catch{}if(!audioContext&&context&&context.state!=='closed')context.close().catch(()=>{});};
  try{context=audioContext||new AudioContextClass();const analyser=context.createAnalyser();analyser.fftSize=2048;source=context.createMediaStreamSource(stream);source.connect(analyser);const samples=new Float32Array(analyser.fftSize),detect=createPauseDetector(performance.now());context.resume().catch(()=>{stop();onUnavailable?.();});
    function tick(now){if(closed)return;analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);onLevel?.(Math.min(4,Math.ceil(rms*65)));const result=detect(rms,now);if(result.end){stop();onEnd?.(result);return;}frame=requestAnimationFrame(tick);}
    frame=requestAnimationFrame(tick);return stop;
  }catch{stop();return null;}
}

// Resume on the user's tap, before the network request. Keep that audio session
// available for the reply instead of requesting autoplay after a long AI wait.
export function createVoiceOutput({AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
  let context=null,source=null,finish=null,generation=0,streamStop=null;
  function stop(){generation++;streamStop?.();streamStop=null;const done=finish;finish=null;if(source){try{source.stop();source.disconnect();}catch{}source=null;}done?.(false);}
  function unlock(){try{if(!AudioContextClass)return Promise.resolve(false);if(!context||context.state==='closed')context=new AudioContextClass();return context.resume().then(()=>context.state==='running').catch(()=>false);}catch{return Promise.resolve(false);}}
  async function play(bytes,onStart){stop();const selected=generation;if(!context||context.state!=='running')throw Error('Tap the microphone or Send to enable voice.');const buffer=await context.decodeAudioData(bytes.slice(0));if(selected!==generation)return false;source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);return new Promise((resolve,reject)=>{finish=resolve;source.onended=()=>{if(selected!==generation)return;finish=null;source?.disconnect();source=null;resolve(true);};try{onStart?.();source.start();}catch(e){finish=null;source=null;reject(e);}});}
  async function dispose(){stop();if(context&&context.state!=='closed')await context.close();context=null;}
  async function playPCM(body,onStart){
    stop();const selected=generation;if(!context||context.state!=='running')throw Error('Tap the microphone to enable voice.');
    const reader=body.getReader(),sources=new Set();let carry=null,total=0,next=context.currentTime,started=false,ended=false,resolveDone;
    const done=new Promise(resolve=>resolveDone=resolve),complete=()=>{if(ended&&!sources.size)resolveDone(true);};
    streamStop=()=>{reader.cancel().catch(()=>{});for(const item of sources){try{item.stop();item.disconnect();}catch{}}sources.clear();resolveDone(false);};
    try{while(selected===generation){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>8*1024*1024)throw Error('Spoken reply is too large.');let bytes=part.value;if(carry!==null){const joined=new Uint8Array(bytes.length+1);joined[0]=carry;joined.set(bytes,1);bytes=joined;carry=null;}if(bytes.length%2){carry=bytes.at(-1);bytes=bytes.subarray(0,-1);}if(!bytes.length)continue;if(selected!==generation)return false;
      const buffer=context.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
      const item=context.createBufferSource();item.buffer=buffer;item.connect(context.destination);sources.add(item);item.onended=()=>{sources.delete(item);item.disconnect();complete();};next=Math.max(next,context.currentTime+.025);item.start(next);next+=buffer.duration;if(!started){started=true;onStart?.();}
    }if(selected!==generation)return false;if(carry!==null||!started)throw Error('The spoken reply was interrupted.');ended=true;complete();return await done;
    }catch(e){if(selected!==generation)return false;streamStop?.();throw e;}finally{reader.releaseLock();if(selected===generation)streamStop=null;}
  }
  return {unlock,play,playPCM,stop,dispose,getContext:()=>context};
}
