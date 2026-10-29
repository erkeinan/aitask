import {withQueued} from './offline-store.mjs';
export function mergeCaptureSync(current,remote,remaining,acknowledged){
  const next=structuredClone((remote.clientRevision||0)>=(current.clientRevision||0)?remote:current);
  for(const key of ['groups','notes'])for(const record of remote[key]||[]){if(!acknowledged.includes(record.id))continue;const i=next[key].findIndex(r=>r.id===record.id);if(i<0)next[key].push(record);else if(next[key][i].offlinePending)next[key][i]=record;}
  return withQueued(next,remaining);
}
