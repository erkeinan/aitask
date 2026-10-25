import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
// An authenticated, encrypted cookie survives server restarts. Provider tokens
// remain HttpOnly and are never exposed to application JavaScript.
export function sessionCodec(secret){
  const key=createHash('sha256').update(secret).digest();
  return {
    seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');},
    open(value){try{const b=Buffer.from(value,'base64url'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}catch{return null;}}
  };
}
