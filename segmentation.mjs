const web=/\b(?:website|web site|web development|landing page|ecommerce|e-commerce)\b|(?:לבנות|בניית|פיתוח|לעדכן|עדכון|עיצוב|שיפור)\s+(?:אתר|האתר)|(?:טיפול|לטפל|עבודה|לעבוד)\s+(?:באתר|על האתר)|אתר\s+(?:אינטרנט|לעסק|ללקוח)/iu;
const development=/\b(?:develop(?:ment|er|ing)?|software|coding|programming|codebase|debug(?:ging)?|bug fix|api|supabase|render|deployment|deploy|github|frontend|backend|app development|crm)\b|פיתוח|תכנות|תוכנה|אפליקציה|דיבאג|תיקון באג/iu;
const personal=/\b(?:personal (?:website|blog|app|project)|hobby|wedding|family website)\b|אתר\s+(?:אישי|חתונה|משפחתי)|בלוג אישי|פרויקט אישי|אפליקציה אישית/iu;
const business=/\b(?:client|customer|business|company|for work|work project)\b|לקוח|לעסק|לעבודה|לחברה|עסקי/iu;
const loan=/\b(?:loans?|lent|borrowed|lending|owe[sd]?|needs? to pay me)\b|הלווא|הלוויתי|לווה|חייב(?:ת)? לי|צריך להחזיר לי/iu;
const money=/\b(?:payment|paid|deposit|salary|bank|money|tax)\b|תשלום|שילמתי|הפקדתי|משכורת|כסף|מסים|מיסים/iu;
const generic=value=>!value||/^(?:personal|family|work|general|notes?|tasks?|uncategorized)$/i.test(value);
export function classifyRecord(text,{space='',category='',parent=null}={}){
  text=String(text||'');const isLoan=loan.test(text),isWeb=web.test(text),isDev=development.test(text),work=business.test(text);
  let segment=space||parent?.space||'Personal',topic=category||parent?.category||'';
  if(isWeb){if(personal.test(text))segment='Personal';else segment='Work';if(generic(topic)||/^(?:development|work development)$/i.test(topic))topic='Websites';}
  else if(isDev){segment=personal.test(text)?'Personal':'Work';if(generic(topic)||/^(?:websites|work development|software|coding)$/i.test(topic))topic='Development';}
  else if(work)segment='Work';
  if(isLoan){if(!space&&!parent)segment=work?'Work':'Personal';if(generic(category)||web.test(category))topic='Loans';}
  else if(money.test(text)&&generic(topic))topic='Finance';
  return {space:segment,category:topic||'Notes'};
}
export function financialRecord(record){return !!record.money||loan.test([record.category,record.text,record.title].filter(Boolean).join(' '));}
export function reviewSegmentation(state){
  const next=structuredClone(state);
  for(const record of [...next.groups,...(next.notes||[])]){if(record.classificationManual||record.needsSegmentation)continue;const text=[record.title,record.text,...(record.steps||[]).map(s=>s.title),...(record.sources||[])].filter(Boolean).join('\n');Object.assign(record,classifyRecord(text,{space:record.space,category:record.category,parent:next.groups.find(g=>g.id===(record.parentId||record.groupId))}));}
  next.segmentationVersion=2;return next;
}
export function financialFollowup(text){return /\d/u.test(text)&&(/\b(?:another|additional|more|also|total|loan|lent|borrowed|owe)\b|עוד|נוסף|סכום|הלווא|חייב|בסך/iu.test(text)||/^\s*[₪$€£]?\s*[\d,.]+\s*(?:ILS|USD|EUR|שקל(?:ים)?|ש[״"]?ח)?[.!]?\s*$/iu.test(text));}
export function normalizeCaptureActions(state,actions,text){
  const creations=actions.filter(a=>['create_group','create_note'].includes(a.type));return actions.map(action=>{if(!creations.includes(action))return action;const parent=state.groups.find(g=>g.id===(action.type==='create_note'?action.group_id:action.parent_id));const classification=classifyRecord([creations.length===1?text:'',action.title,action.text].join('\n'),{space:action.space,category:action.category,parent});return {...action,...classification};});
}
export function financialCreationReview(state,reply,text,threadId='inbox'){
  if(/\b(?:separate|unrelated|different loan|new loan)\b|הלוואה (?:חדשה|נפרדת)|לא קשור|בנפרד/iu.test(text))return null;
  const clearAmountMeaning=/\b(?:another|additional|more|add|correct|instead|total)\b|עוד|נוסף|תיקון|במקום|בסך הכל|סה[״"]?כ/iu.test(text);
  const creations=reply.actions.filter(a=>a.type==='create_note'||a.type==='update_note'&&financialFollowup(text)&&!clearAmountMeaning);if(!creations.length)return null;
  const updating=creations.find(a=>a.type==='update_note');const current=updating?state.notes.find(n=>n.id===updating.note_id):threadId.startsWith('note:')?state.notes.find(n=>n.id===threadId.slice(5)):null;
  const proposed=creations.find(a=>financialRecord({text:a.text,category:a.category})||current&&financialRecord(current)&&financialFollowup(text));if(!proposed)return null;
  const people=(proposed.people||[]).map(p=>p.trim().toLocaleLowerCase());
  let candidates=state.notes.filter(n=>!n.archivedAt&&financialRecord(n));
  if(people.length)candidates=candidates.filter(n=>[...(n.people||[]),n.money?.person].filter(Boolean).some(p=>people.includes(p.trim().toLocaleLowerCase())));
  else if(current&&financialRecord(current))candidates=[current];
  else if(!financialFollowup(text))return null;
  if(!candidates.length)return null;
  const he=/[\u0590-\u05ff]/u.test(text),title=n=>n.money?.person?n.money.person+' · '+n.money.amount+' '+(n.money.currency||''):n.text.split('\n')[0].slice(0,90);
  const options=candidates.length===1?[
    {label:he?'סכום נוסף לאותה הלוואה':'Additional amount',value:he?'זה סכום נוסף לאותה הלוואה. עדכן את הפתק הקיים ושמור את הסכום המקורי.':'This is an additional amount for the same loan. Update the existing note and preserve the original amount.',detail:''},
    {label:he?'תיקון הסכום הכולל':'Correct total',value:he?'זה תיקון לסכום הכולל של אותה הלוואה, לא סכום נוסף.':'This corrects the total of the same loan; it is not an additional amount.',detail:''}
  ]:candidates.slice(0,3).map(n=>({label:title(n),value:(he?'הסכום קשור לפתק הקיים: ':'This amount relates to the existing note: ')+title(n),detail:''}));
  options.push({label:he?'הלוואה נפרדת':'Separate loan',value:he?'זו הלוואה נפרדת. שמור פתק חדש ונפרד.':'This is a separate loan. Save a new, separate note.',detail:''});
  return {...reply,actions:[],message:he?`זה סכום נוסף עבור ${title(candidates[0])}, תיקון לסכום הכולל, או הלוואה נפרדת?`:`Is this an additional amount for ${title(candidates[0])}, a corrected total, or a separate loan?`,question:{title:he?`הסכום שייך ל${title(candidates[0])}?`:`Does this belong with ${title(candidates[0])}?`,options,allow_date:false,date_target:null},relationTarget:candidates.length===1?'note:'+candidates[0].id:null};
}
