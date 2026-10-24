const install=document.querySelector('#install-app');
let promptEvent=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const sync=()=>{install.hidden=standalone();};
const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','install-title');
const heading=document.createElement('div');heading.className='dialog-heading';const title=document.createElement('h2');title.id='install-title';title.textContent='Install Woven';const close=document.createElement('button');close.className='plain';close.type='button';close.textContent='×';close.setAttribute('aria-label','Close install instructions');close.onclick=()=>dialog.close();heading.append(title,close);dialog.append(heading);
for(const [label,text]of [['iPhone or iPad','Open Woven in Safari. Tap Share, then Add to Home Screen, and confirm Add.'],['Android','Open Woven in Chrome. Open the ⋮ menu and choose Install app or Add to Home screen.'],['Computer','Open Woven in Chrome or Edge and choose the install icon in the address bar, or Install Woven in the browser menu.']]){const section=document.createElement('section');section.className='install-step';const strong=document.createElement('strong');strong.textContent=label;const paragraph=document.createElement('p');paragraph.textContent=text;section.append(strong,paragraph);dialog.append(section);}
const note=document.createElement('p');note.className='small';note.textContent='If you’re viewing Woven inside another app, open it in your browser first. Sign in after installing. Internet is needed for tasks, AI and syncing.';dialog.append(note);document.body.append(dialog);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;sync();});
window.addEventListener('appinstalled',()=>{promptEvent=null;install.hidden=true;if(dialog.open)dialog.close();});
matchMedia('(display-mode: standalone)').addEventListener('change',sync);
install.onclick=async()=>{document.querySelector('#main-menu').open=false;if(standalone()){sync();return;}if(!promptEvent){dialog.showModal();return;}const event=promptEvent;promptEvent=null;try{await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted')install.hidden=true;}catch{dialog.showModal();}};
sync();
if('serviceWorker' in navigator){const register=()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});}
