import {sessionCodec} from './session-cookie.mjs';
export function aiVault(secret){if(!secret||secret.length<32)throw Error('Persistent AI connection needs the private server session secret.');const codec=sessionCodec('woven-ai-key-v1:'+secret);return {seal:key=>codec.seal({key}),open:value=>codec.open(value)?.key||''};}
