// FIFO saves wait for a short write transaction instead of being rejected.
export function createGate(){let tail=Promise.resolve();return {async acquire(){const prior=tail;let release;tail=new Promise(resolve=>release=resolve);await prior;let done=false;return ()=>{if(!done){done=true;release();}};}};}
