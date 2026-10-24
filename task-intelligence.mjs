// Shared parsing and safe action links. No external action is executed here.
export function splitList(text){
  let value=String(text||'').trim();
  const intro=/^(?:(?:shopping|grocery|groceries|packing|to.do)(?:\s+list)?|buy|purchase|pack|קניות|רשימת\s+קניות|לקנות|לקנות את|לארוז)\s*:?\s+/iu;
  const listLike=intro.test(value)||/^[^:\n]{1,45}:(?!\/\/)\s*(?:\n|.+[,;،])/u.test(value);
  value=value.replace(intro,'').replace(/^[^:\n]{1,45}:\s*(?=\n)/u,'');
  if(listLike)value=value.replace(/^[^:\n]{1,45}:(?!\/\/)\s*/u,'');
  if(/^\d+[.)]\s/.test(value))value=value.replace(/\s+(?=\d+[.)]\s)/g,'\n');
  value=value.replace(/\b(?:macaroni and cheese|fish and chips|peanut butter and jelly)\b/gi,phrase=>phrase.replace(/ and /i,' \uE000 '));
  const parts=[];let current='',depth=0,quote='';
  const flush=()=>{const line=current.trim().replace(/^(?:[-*•–]|\d+[.)]|\[[ xX]\])\s*/u,'').trim();if(line)parts.push(line);current='';};
  for(let i=0;i<value.length;i++){
    const c=value[i];
    if((c==='"'||c==='“'||c==='”')&&!/\d/.test(value[i-1]||'')){if(quote)quote='';else quote=c;current+=c;continue;}
    if(!quote){if('(['.includes(c))depth++;if(')]'.includes(c))depth=Math.max(0,depth-1);}
    const numericComma=c===','&&/\d/.test(value[i-1]||'')&&/^\d{3}(?:\D|$)/.test(value.slice(i+1));
    const urlToken=/https?:\/\/\S*$/i.test(current);
    if(!depth&&!quote&&(c==='\n'||c===';'||c==='•'||((c===','||c==='،')&&!numericComma&&!urlToken))){flush();continue;}
    current+=c;
  }
  flush();
  const actionStart='(?:call|phone|email|send|update|check|buy|book|review|upload|download|submit|pay|להתקשר|לשלוח|לעדכן|לבדוק|לקנות|להזמין|להעלות|לשלם)';
  const result=parts.flatMap(part=>{if(/[()"“”]/.test(part))return [part];return part.split(new RegExp('\\s+(?:and|then|and then|ואז|ולאחר מכן)\\s+(?='+actionStart+'(?:\\s|$))|\\s+(?:ואז|ולאחר מכן)\\s+|\\s+ו(?=ל(?:התקשר|שלוח|עדכן|בדוק|קנות|הזמין|העלות|שלם))'+(listLike?'|\\s+and\\s+|\\s+ו(?=[א-ת])':''),'iu'));});
  return result.map(v=>v.replaceAll('\uE000','and').trim()).filter(Boolean);
}
export const actionKinds={call:{label:'Call',field:'Phone number',placeholder:'+972…'},whatsapp:{label:'WhatsApp',field:'Phone number with country code',placeholder:'+972…'},email:{label:'Email',field:'Email address',placeholder:'name@example.com'},sms:{label:'Text message',field:'Phone number',placeholder:'+972…'},cloud_file:{label:'Update cloud file',field:'Cloud file link',placeholder:'https://…'},website:{label:'Open website',field:'Website link',placeholder:'https://…'},maps:{label:'Directions',field:'Destination',placeholder:'Street, city'}};
export function safeTarget(type,value){
  if(!actionKinds[type]||typeof value!=='string'||value.length>2000)throw Error('Choose a supported action.');
  const raw=value.trim();if(!raw)return '';
  if(['call','sms','whatsapp'].includes(type)){if(!/^\+?[\d ().-]+$/.test(raw))throw Error('Enter a valid phone number.');const phone=raw.replace(/[ ().-]/g,'');if(!/^\+?\d{7,15}$/.test(phone))throw Error('Enter a valid phone number.');if(type==='whatsapp'&&!/^\+[1-9]\d{6,14}$/.test(phone))throw Error('Include the country code, starting with +.');return phone;}
  if(type==='email'){if(!/^[^\s<>@?&#]+@[^\s<>@?&#]+\.[^\s<>@?&#]+$/.test(raw))throw Error('Enter an email address.');return raw;}
  if(type==='website'||type==='cloud_file'){let url;try{url=new URL(raw);}catch{throw Error('Enter a full https:// link.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a secure https:// link without a password.');return url.href;}
  if(/[\x00-\x1f]/.test(raw))throw Error('Enter a destination.');return raw;
}
export function actionHref(action){
  const target=safeTarget(action.type,action.target||'');if(!target)return '';
  const draft=String(action.draft||'').slice(0,4000);
  switch(action.type){case 'call':return 'tel:'+target;case 'sms':return 'sms:'+target+(draft?'?body='+encodeURIComponent(draft):'');case 'whatsapp':return 'https://wa.me/'+target.slice(1)+(draft?'?text='+encodeURIComponent(draft):'');case 'email':return 'mailto:'+encodeURIComponent(target).replace('%40','@')+(draft?'?body='+encodeURIComponent(draft):'');case 'maps':return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(target);default:return target;}
}
export function detectActions(text,saved=[]){
  const value=String(text||''),rules=[['whatsapp',/\bwhats\s?app\b|וואטסאפ|ווטסאפ/iu],['call',/\b(?:call|phone|ring)\b|להתקשר|התקשר/iu],['email',/\b(?:email|e-mail)\b|אימייל|דוא[״"]?ל|לשלוח מייל/iu],['sms',/\bsms\b|\btext (?:message|[A-Z])|מסרון/iu],['cloud_file',/\b(?:update|edit|revise|upload).*(?:cloud|spreadsheet|google doc|drive|onedrive|dropbox|file)|(?:לעדכן|לערוך|להעלות).*(?:קובץ|טבלה|ענן|דרייב)|https:\/\/(?:docs\.google|drive\.google|[^/]+\.sharepoint|onedrive\.live)\./iu],['maps',/\b(?:navigate|directions|drive to)\b|ניווט|לנסוע ל/iu],['website',/\b(?:open|visit|browse).*(?:https:|website|site)|(?:לפתוח|להיכנס).*(?:אתר|https:)/iu]];
  // Reference facts and negative instructions do not create action buttons.
  if(/^(?:do not|don.t|no need to|לא |אין צורך)|\b(?:do not|don.t|never)\s+(?:call|send|email|phone)|לא\s+(?:להתקשר|לשלוח)/iu.test(value.trim()))return [];
  const phones=[...value.matchAll(/\+\d[\d ().-]{6,}\d/g)],emails=[...value.matchAll(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@.,;]+/g)],urls=[...value.matchAll(/https:\/\/[^\s<>]+/gi)];
  const phone=phones.length===1?phones[0]:null,email=emails.length===1?emails[0]:null,url=urls.length===1?urls[0]:null;
  const reference=/\b(?:prefers?|owes?|needs? to pay me|has to pay me)\b|חייב(?:ת)? לי/iu.test(value)&&!/^\s*(?:please\s+)?(?:call|send|email|phone|להתקשר|לשלוח|לעדכן)\s/iu.test(value);
  const actions=rules.filter(([,pattern])=>!reference&&pattern.test(value)).map(([type])=>{
    let target=['call','sms','whatsapp'].includes(type)?phone?.[0]||'':type==='email'?email?.[0]||'':['website','cloud_file'].includes(type)?url?.[0]?.replace(/[.,;)]+$/,'')||'':'';
    try{target=safeTarget(type,target);}catch{target='';}return {type,target,draft:''};
  });
  for(const item of saved||[]){if(!actionKinds[item.type])continue;try{const action={type:item.type,target:safeTarget(item.type,item.target||''),draft:String(item.draft||'').slice(0,4000)};const at=actions.findIndex(a=>a.type===item.type);if(at>=0)actions[at]=action;else actions.push(action);}catch{/* Ignore unsafe legacy links. */}}
  return actions;
}
export function groupedEntries(entries,state,mode='category'){
  const groups=new Map();
  for(const item of entries){let key,label;
    if(mode==='task'){let record=item.record,parent=item.note?.groupId||record.parentId,id=item.group?.id;const seen=new Set();while(parent&&!seen.has(parent)){seen.add(parent);const found=state.groups.find(g=>g.id===parent);if(!found)break;record=found;id=found.id;parent=found.parentId;}key=id||'notes';label=id?record.title:'Unlinked notes';}
    else{const category=item.record.category||item.record.space||'Uncategorized';label=item.record.space&&category.toLocaleLowerCase()!==item.record.space.toLocaleLowerCase()?item.record.space+' / '+category:category;key=label.toLocaleLowerCase();}
    if(!groups.has(key))groups.set(key,{key,label,entries:[]});groups.get(key).entries.push(item);
  }
  return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
