import {normalizeLanguages} from './voice-preferences.mjs';
export function transcriptionForm(input,model='gpt-transcribe',context=''){
  const formats={'audio/webm':'webm','audio/mp4':'mp4','audio/wav':'wav','audio/mpeg':'mp3','audio/x-m4a':'m4a'};
  const mime=String(input.mime||'').split(';')[0];
  if(!formats[mime]||typeof input.audio!=='string'||!input.audio||input.audio.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio))throw Error('Use a voice recording under 10 MB.');
  const bytes=Buffer.from(input.audio,'base64');if(!bytes.length||bytes.length>10*1024*1024)throw Error('Use a voice recording under 10 MB.');
  const language=input.language??'auto';if(typeof language!=='string'||! /^[a-z]{2,4}$/.test(language))throw Error('Choose a supported voice language.');
  const languages=input.languages!==undefined?normalizeLanguages(input.languages):language==='he'?['he','en']:language==='es'?['es','en']:language==='auto'?[]:[language];
  const form=new FormData();form.append('model',model);form.append('file',new Blob([bytes],{type:mime}),'voice.'+formats[mime]);
  if(model==='gpt-transcribe')for(const value of languages)form.append('languages[]',value);else if(languages.length)form.append('language',languages[0]);
  const hint=language==='he'?'שיחה בעברית ואנגלית על משימות אישיות ועבודה.':language==='es'?'Conversación en español e inglés sobre tareas personales y de trabajo.':language==='ar'?'محادثة باللغة العربية حول المهام الشخصية والعمل.':'A conversation about personal and work tasks.';
  form.append('prompt',hint+(context?'\nRecent conversation (context only): '+String(context).slice(-1000):''));return form;
}
export function transcriptNeedsReview(text,language='auto'){
  const arabic=(String(text).match(/[\u0600-\u06ff]/gu)||[]).length,hebrew=(String(text).match(/[\u0590-\u05ff]/gu)||[]).length;
  return language==='he'&&arabic>2&&arabic>hebrew;
}
