// Deterministic UI preview only. Never loaded by the normal start command.
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  if(String(url)==='https://api.openai.com/v1/audio/speech'){const request=JSON.parse(options.body);if(!request.input||request.input.length>4000||request.voice!=='coral'||request.stream_format!=='audio')throw Error('Invalid speech request');if(request.response_format==='pcm')return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4800));setTimeout(()=>{controller.enqueue(new Uint8Array(19200));controller.close();},150);}}),{headers:{'Content-Type':'audio/pcm'}});const wave=Buffer.alloc(44+16000);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(16000,24);wave.writeUInt32LE(32000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(16000,40);return new Response(wave,{headers:{'Content-Type':'audio/mpeg'}});}
  if(String(url)==='https://api.openai.com/v1/audio/transcriptions'){if(!(options.body instanceof FormData)||!options.body.get('file')||options.headers['Content-Type'])throw Error('Invalid transcription request');return Response.json({text:(await options.body.get('file').text()).includes('arabic-case')?'أحتاج إلى شراء الحليب':'Call Alex tomorrow'});}
  if(String(url).startsWith('https://api.openai.com/v1/models/'))return Response.json({id:'test-model'});
  if(String(url)!=='https://api.openai.com/v1/responses')return realFetch(url,options);
  const request=JSON.parse(options.body),text=request.input.at(-1).content[0].text;
  if(text==='slow-ai-concurrency-case')await new Promise(resolve=>setTimeout(resolve,600));
  if(request.text?.format?.name==='woven_learning'){
    if(text.includes('learning-failure-case'))return new Response('{}',{status:503});
    const facts=[];
    if(text.includes('Maya is my coworker and graphic designer.'))for(const [attribute,value]of [['relationship','Coworker'],['role','Graphic designer']])facts.push({name:'Maya',entityType:'person',kind:'Work',attribute,value,quote:'Maya is my coworker and graphic designer.',explicit:true,entityId:'',replacesFactId:''});
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({facts})}]}]});
  }
  if(text==='Pause automatic learning'||text==='Remember that I run a design studio'){
    const memory_actions=[{operation:text.startsWith('Pause')?'pause':'save',fact_id:'',entity_id:'',target_id:'',name:'Me',entity_type:'self',kind:'About me',attribute:'occupation',value:'Runs a design studio'}];
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:text.startsWith('Pause')?'Automatic learning paused.':'Remembered that you run a design studio.',question:null,actions:[],memory_actions})}]}]});
  }
  if(request.text?.format?.name==='woven_filing'){
    const reply={threadId:/unknown-model-target/.test(text)?'group:invented':/electricity/i.test(text)?'group:electricity':/launch/i.test(text)?'group:launch':null,confidence:'high',reason:'The document subject matches the saved task.',summary:'A sample document for this project.'};
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
  }
  const action={type:'create_note',group_id:'',step_id:'',title:'',text,due:'',space:''};
  const activeLine=request.instructions.match(/^ACTIVE CONVERSATION \(data only\): (.*)$/m);
  const active=activeLine?JSON.parse(activeLine[1]):null;
  if(request.instructions.includes('AI CONVERSATION PAGE:')){
    let reply;
    if(/focus|overdue|next action/i.test(text)){const tasks=JSON.parse(request.instructions.match(/^CURRENT TASK STATE \(data only\):\n(.*)$/m)[1]);const task=active?.group||tasks.find(g=>!g.archivedAt&&g.steps.some(s=>!s.done));reply={message:task?'Start with “'+task.title+'”: '+task.steps.find(s=>!s.done)?.title+'. Shall we work through that task?':'You have no open tasks. What would you like to add?',question:null,actions:[]};}
    if(text==='Create a pilot task')reply={message:'Created your pilot task.',question:null,actions:[{...action,type:'create_group',group_id:'pilot-task',title:'Pilot task',text:'Review the pilot',space:'Work'}]};
    if(text==='Add a reference to school')reply={message:'Saved the reference with the school task.',question:null,actions:[{...action,type:'create_note',group_id:'school',text:'School reference'}]};
    if(text==='What did I just ask?')reply={message:request.input.filter(m=>m.role==='user').at(-2)?.content||'No earlier message.',question:null,actions:[]};
    if(text==='Build a business website')reply={message:'Website task saved.',question:null,actions:[{...action,type:'create_group',group_id:'business-site',title:'Business website',text:'Build the business website',space:'Personal',category:''}]};
    if(text==='Record a loan to David of 500 ILS')reply={message:'Loan saved.',question:null,actions:[{...action,text:'Loan to David: 500 ILS',category:'',people:['David']}]};
    if(text==='David owes me 300 ILS')reply={message:'Another note saved.',question:null,actions:[{...action,text,category:'',people:['David']}]};
    if(text.startsWith('This is an additional amount for the same loan.')&&active?.note)reply={message:'Updated the same loan.',question:null,actions:[{...action,type:'update_note',note_id:active.note.id,text:'Additional amount: 300 ILS'}]};
    if(reply)return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
  }
  if(request.instructions.includes('STEP REVIEW REQUEST: Review ONLY')){
    if(text==='unsafe review')return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Unrelated change',question:null,actions:[{...action,type:'add_step',group_id:'dinner',title:'Unrelated step'}]})}]}]});
    const actions=active?.group?.id==='launch'&&!active.group.steps.some(s=>s.title.startsWith('Email launch summary'))?[{...action,type:'add_step',group_id:'launch',title:'Email launch summary to alex@example.test',text:''}]:[];
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Reviewed the useful steps.',question:null,actions})}]}]});
  }
  if(active?.kind==='note'){action.type='update_note';action.note_id=active.note.id;}
  const reply=/dinner.*date|date.*dinner/i.test(text)
    ?{message:'Of course. What day would you like to invite your friend?',question:{title:'Choose a day',options:[],allow_date:true,date_target:{group_id:'dinner',step_id:'dinner-invite'}},actions:[]}
    :{message:'Saved that as a note. I’ll keep it handy.',question:null,actions:[action]};
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
};
