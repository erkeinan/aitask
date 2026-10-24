import {addNote} from './records.mjs';
import {financialRecord} from './segmentation.mjs';
const currencies={USD:/^(?:usd|us dollars?|american dollars?)$/i,ILS:/^(?:ils|nis|shekels?|israeli shekels?|שקל(?:ים)?|ש[״"']?ח|₪)$/i,EUR:/^(?:eur|euros?|אירו|יורו|€)$/i,GBP:/^(?:gbp|british pounds?|pounds? sterling|£)$/i,CAD:/^(?:cad|canadian dollars?)$/i,AUD:/^(?:aud|australian dollars?)$/i,CHF:/^(?:chf|swiss francs?)$/i,JPY:/^(?:jpy|japanese yen)$/i};
const currencyCodes=new Set(Intl.supportedValuesOf('currency'));
export function currencyCode(value){const text=String(value||'').trim().replace(/[.!?]$/,'').replace(/^(?:in|it is|it's)\s+/i,'');return Object.entries(currencies).find(([,pattern])=>pattern.test(text))?.[0]||(currencyCodes.has(text.toUpperCase())?text.toUpperCase():null);}
export function receivableFact(text){
  const clean=String(text).trim().replace(/[.!]$/,'');
  if(/[?？]$/.test(clean)||/\b(?:remind|maybe|no longer|already paid|doesn.t owe)\b/i.test(clean))return null;
  const match=clean.match(/^([\p{L}\p{M}'’׳״ .-]{1,60}?)\s+(?:needs?\s+to\s+pay\s+me|owes\s+me|has\s+to\s+pay\s+me|חייב(?:ת)?\s+לי|צרי[ךכ](?:ה)?\s+(?:לשלם|להחזיר)\s+לי|צריכה\s+(?:לשלם|להחזיר)\s+לי)\s+([₪€£$]?)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(.*?)$/iu);
  if(!match||/^(?:remind|ask|tell|does|if|maybe|i |do |don.t|not )/i.test(match[1]))return null;
  const amount=Number(match[3].replaceAll(',',''));if(!Number.isFinite(amount)||amount<=0)return null;
  return {person:match[1].trim(),amount,currency:currencyCode(match[4])||currencyCode(match[2]),source:String(text).trim()};
}
const hebrew=text=>/[\u0590-\u05ff]/u.test(text);
const currencyQuestion=(person,he=false)=>({title:he?`באיזה מטבע הסכום ש${person} חייב לך?`:`Which currency is the amount ${person} owes you?`,options:[{label:he?'שקלים · ILS':'Shekels · ILS',value:'ILS',detail:''},{label:he?'דולר ארה״ב · USD':'US dollars · USD',value:'USD',detail:''},{label:he?'אירו · EUR':'Euros · EUR',value:'EUR',detail:''}],allow_date:false,date_target:null});
export function captureReceivable(state,text,threadId='inbox'){
  const current=threadId.startsWith('note:')?(state.notes||[]).find(n=>n.id===threadId.slice(5)):null;
  if(current?.money?.currency===null){
    const currency=currencyCode(text);
    if(currency){const next=structuredClone(state),note=next.notes.find(n=>n.id===current.id);note.money.currency=currency;note.text=note.money.source+'\nCurrency: '+currency;
      return {next,threadId,reply:{message:hebrew(note.money.source)?`נשמר כפתק: ${note.money.person} חייב לך ${note.money.amount} ${currency}.`:`Saved: ${note.money.person} owes you ${note.money.amount} ${currency}.`,question:null,actions:[]}};
    }
    if(/^(?:dollars?|pounds?|yen|rupees?|\$|other|another currency)$/i.test(text.trim()))return {next:structuredClone(state),threadId,reply:{message:'Which currency do you mean? You can write its name or code, such as Canadian dollars or CAD.',question:currencyQuestion(current.money.person),actions:[]}};
  }
  const fact=receivableFact(text);if(!fact)return null;
  const personPattern=new RegExp('(?:^|[^\\p{L}])'+fact.person.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}])','iu');
  if((state.notes||[]).some(n=>!n.archivedAt&&financialRecord(n)&&([...(n.people||[]),n.money?.person].some(p=>p?.toLocaleLowerCase()===fact.person.toLocaleLowerCase())||personPattern.test(n.text))))return null;
  const next=addNote(state,{text:fact.source,...(threadId.startsWith('group:')?{groupId:threadId.slice(6)}:{})}),note=next.notes.at(-1);
  note.money={direction:'receivable',...fact};
  note.category='Loans';note.space??='Personal';note.people=[fact.person];
  const he=hebrew(fact.source);
  return {next,threadId:'note:'+note.id,reply:{message:fact.currency?(he?`נשמר כפתק: ${fact.person} חייב לך ${fact.amount} ${fact.currency}.`:`Saved: ${fact.person} owes you ${fact.amount} ${fact.currency}.`):(he?`רשמתי כפתק ש${fact.person} חייב לך ${fact.amount}. באיזה מטבע?`:`I’ve noted that ${fact.person} owes you ${fact.amount}. Which currency?`),question:fact.currency?null:currencyQuestion(fact.person,he),actions:[{type:'create_note',group_id:note.groupId||'',step_id:'',note_id:note.id,title:'',text:note.text,due:'',space:''}]}};
}
