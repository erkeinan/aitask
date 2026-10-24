// Bound both the request and body reading so a stalled response cannot leave
// the composer disabled indefinitely. A timeout is not proof a save failed.
export async function requestJSON(path,options={}, {fetcher=fetch,timeoutMs=90000}={}){
  const controller=new AbortController();let timer;
  try{
    return await Promise.race([
      (async()=>{const response=await fetcher(path,{...options,signal:controller.signal});const data=await response.json();return {response,data};})(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('This is taking longer than expected. Refresh the conversation to check what was saved before trying again.'));},timeoutMs);})
    ]);
  }catch(error){if(controller.signal.aborted)throw Error('This is taking longer than expected. Refresh the conversation to check what was saved before trying again.');throw error;}
  finally{clearTimeout(timer);}
}
