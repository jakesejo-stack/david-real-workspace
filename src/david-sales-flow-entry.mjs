// DAVID unified post-call workflow. Existing navigation and Twilio dial buttons remain authoritative.
// Every list is filled only from authenticated, real server records. No fake call or audio content.
import {createClient} from '@supabase/supabase-js';
import {Device} from '@twilio/voice-sdk';
let client,config;
let callingDevice=null,callingCall=null,connecting=false;
let activeCallStatus='';
async function jwt(){
 if(!config){const r=await fetch('/api/config',{cache:'no-store'});config=await r.json();}
 if(!client)client=createClient(config.supabaseUrl,config.supabaseAnonKey);
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Нужен е Google вход');
 return session.access_token;
}
async function api(path,method='GET',payload){
 const token=await jwt();
 const res=await fetch(path,{method,cache:'no-store',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
 const out=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(out.error||'Сървърът не потвърди операцията');
 return out;
}
const endp=action=>'/api/integrations/david/'+action;
const preflightDescriptions={
 missing_server_config:'Липсва Twilio настройка във Vercel',
 invalid_sid_or_caller_id_format:'Невалиден Caller ID или Twilio идентификатор',
 twilio_account_auth_invalid:'Twilio Account SID / Auth Token не се приемат',
 twilio_api_key_invalid:'Twilio API Key SID / Secret не се приемат',
 twiml_voice_url_wrong:'Twilio TwiML App Voice URL не съвпада с DAVID',
 caller_id_not_verified:'Изходящият номер не е потвърден в Twilio',
 trial_destination_not_verified:'Twilio Trial изисква потвърден номер на Митко',
 approved_task_missing:'Няма одобрена задача или разрешен номер за днес',
 live_calls_disabled:'Реалните разговори са изключени в DAVID',
 daily_attempt_already_used:'Тестовото обаждане за днес вече е използвано'
};
const preflightMessage=s=>{
 if(s.ready)return '✓ Twilio потвърди акаунта, приложението, Caller ID и днешната задача. Готово за тест.';
 const errors=(s.errors||[]).map(k=>preflightDescriptions[k]||k);
 return 'Twilio проверка: '+(errors.length?errors.join(' · '):'Невъзможно потвърждение');
};
async function startApprovedCall(status){
 if(connecting||callingCall)throw Error('Вече има активен или започващ разговор');
 connecting=true;activeCallStatus='Проверявам одобрената задача и номер...';status(activeCallStatus);
 try{
  // Token comes from the same protected daily-task endpoint used by the real DAVID backend.
  // Never use caller-provided phone numbers to bypass the admin-approved dialing list.
  const preflight=await api(endp('task-preflight'));
  if(!preflight.ready)throw Error(preflightMessage(preflight));
  const task=await api(endp('task-token'),'POST');
  if(!task?.token||!/^\+?[1-9]\d{6,14}$/.test(String(task.dialTo||'')))throw Error('Няма потвърден номер за набиране.');
  if(!window.confirm('Да започнем реално обаждане до '+task.dialTo+'? Twilio начислява такси.')){activeCallStatus='Отказано от оператора';status(activeCallStatus);return;}
  activeCallStatus='Свързвам микрофона към Twilio...';status(activeCallStatus);
  const dev=new Device(task.token,{logLevel:'warn',closeProtection:true});
  callingDevice=dev;
  dev.on('error',err=>{activeCallStatus='Twilio: '+String(err?.message||'Грешка');status(activeCallStatus);});
  const call=await dev.connect({params:{taskId:task.taskId}});
  callingCall=call;
  const finish=()=>{
   stopBrowserRecording();
    if(callingCall===call)callingCall=null;
   if(callingDevice===dev){try{dev.destroy()}catch{}callingDevice=null;}
   activeCallStatus='Разговорът приключи. Попълни резултата и бележката.';status(activeCallStatus);
  };
  call.on('ringing',()=>{activeCallStatus='☎ Звъни...';status(activeCallStatus)});
  call.on('accept',()=>{activeCallStatus='● Реален разговор през Twilio';status(activeCallStatus)});
  call.on('disconnect',finish);call.on('cancel',finish);call.on('reject',finish);
  call.on('error',err=>{activeCallStatus='Twilio: '+String(err?.message||'Грешка');status(activeCallStatus);finish()});
  activeCallStatus='☎ Набиране на '+task.dialTo;status(activeCallStatus);
 }catch(error){
  const hints={
   twilio_task_configuration_incomplete:'Twilio е изключен или липсват сървърни ключове. Свържете администратора.',
   no_approved_dial_target:'Няма одобрена задача с разрешен телефонен номер за днес.',
   daily_call_already_attempted:'За днешната задача вече има направен опит за обаждане.',
   limit_check_unavailable:'Не може да се потвърди лимитът за обаждания. Не набираме.'
  };
  activeCallStatus='Неуспешно обаждане: '+(hints[String(error?.message||'')]||String(error?.message||error));
  status(activeCallStatus);
  if(callingDevice&&!callingCall){try{callingDevice.destroy()}catch{}callingDevice=null;}
  throw error;
 }finally{connecting=false;}
}

let browserRecording=null;
const browserRecordingActive=()=>!!browserRecording?.recorder&&browserRecording.recorder.state!=='inactive';
const recorderFormat=()=>['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
async function beginBrowserRecording(status,updateControls){
 if(browserRecordingActive()||browserRecording?.uploading)throw Error('Вече има активен запис или качване');
 if(!callingCall||callingCall.status()!=='open')throw Error('Няма свързан разговор');
 if(typeof MediaRecorder==='undefined')throw Error('Браузърът не поддържа MediaRecorder');
 const local=callingCall.getLocalStream(),remote=callingCall.getRemoteStream();
 if(!local?.getAudioTracks().length||!remote?.getAudioTracks().length)throw Error('Няма звук и от двете страни. Не започвам непълен запис.');
 const sid=String(callingCall.parameters?.CallSid||'');
 if(!/^CA[0-9a-f]{32}$/i.test(sid))throw Error('Twilio още не е върнал Call SID');
 if(!window.confirm('Кажи на клиента: „Разговорът се записва, искате ли да продължим?“\n\nКлиентът изрично ли даде съгласие да се запишат двата гласа?')){
  status('Няма съгласие. Записът не е стартиран.');return false;
 }
 const mime=recorderFormat();if(!mime)throw Error('Няма поддържан формат за аудиозапис');
 const mimeType=mime.split(';')[0];
 status('Проверявам съгласието и защитеното хранилище...');
 const upload=await api(endp('browser-record-prepare'),'POST',{call_sid:sid,clientConfirmed:true,noticeVersion:'david-v1',method:'verbal',mime_type:mimeType});
 const Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio)throw Error('WebAudio не е достъпен');
 const ctx=new Audio(),mix=ctx.createMediaStreamDestination();
 const op=ctx.createMediaStreamSource(local),customer=ctx.createMediaStreamSource(remote);
 const opGain=ctx.createGain(),customerGain=ctx.createGain();
 opGain.gain.value=0.9;customerGain.gain.value=0.9;
 op.connect(opGain).connect(mix);
 customer.connect(customerGain).connect(mix);
 let recorder;
 try{recorder=new MediaRecorder(mix.stream,{mimeType:mime,audioBitsPerSecond:64000})}
 catch(e){await ctx.close();throw Error('MediaRecorder: '+e.message)}
 const chunks=[];let bytes=0;
 const entry={recorder,ctx,mix,upload,uploading:false};
 browserRecording=entry;
 recorder.ondataavailable=e=>{
  if(e.data?.size){chunks.push(e.data);bytes+=e.data.size}
  if(bytes>26214400&&recorder.state!=='inactive'){status('25 MB лимит. Спирам записа.');recorder.stop()}
 };
 recorder.onerror=e=>status('Грешка от браузърния recorder: '+(e.error?.message||'audio_error'));
 recorder.onstop=async()=>{
  entry.uploading=true;updateControls();
  try{await ctx.close()}catch{}
  for(const track of mix.stream.getTracks())track.stop();
  if(!chunks.length){status('Няма аудиоданни. Нищо не е запазено.');entry.uploading=false;updateControls();return}
  const blob=new Blob(chunks,{type:mimeType});
  if(blob.size>26214400){status('Записът е над лимита 25 MB.');entry.uploading=false;updateControls();return}
  status('Качвам двата гласа в частното хранилище на DAVID...');
  try{
   const {error}=await client.storage.from(upload.bucket).uploadToSignedUrl(upload.path,upload.token,blob,{contentType:mimeType});
   if(error)throw error;
   const result=await api(endp('browser-record-complete'),'POST',{recording_id:upload.recording_id});
   if(!result.saved)throw Error('Сървърът не потвърди запис');
   status('✓ Записът е запазен в Supabase. Аудиото е достъпно само за администратори.');
  }catch(e){status('Записът не се съхрани: '+e.message+'. Няма да твърдим, че е качен.')}
  finally{entry.uploading=false;if(browserRecording===entry)browserRecording=null;updateControls()}
 };
 recorder.start(1000);
 status('🔴 Записвам оператора и клиента локално чрез MediaRecorder, с изрично съгласие.');
 updateControls();return true;
}
function stopBrowserRecording(){
 const rec=browserRecording?.recorder;
 if(!rec||rec.state==='inactive')return false;
 try{rec.stop()}catch{return false}
 return true;
}

function endApprovedCall(){
 if(!callingCall)return false;
 callingCall.disconnect();
 return true;
}

function el(tag,className,text){
 const n=document.createElement(tag);
 if(className)n.className=className;
 if(text!==undefined)n.textContent=text;
 return n;
}
const statusLabels={no_answer:'Не вдигнаха',neutral:'Неутрално',early_access:'Ранно записване'};
const statusIcons={no_answer:'☎',neutral:'◈',early_access:'✓'};
function date(s){return s?new Date(s).toLocaleString('bg-BG',{dateStyle:'short',timeStyle:'short'}):'—';}
const sidOk=s=>/^CA[0-9a-f]{32}$/i.test(String(s||''));
function openTranscript(sid,trigger){if(sidOk(sid))document.dispatchEvent(new CustomEvent('david:open-call',{detail:{sid,trigger}}));}
function noteCard(entry){
 const c=el('article','sf-sale-note');
 c.append(el('strong','',statusIcons[entry.disposition]+' '+(statusLabels[entry.disposition]||entry.disposition)),el('small','',date(entry.updated_at)));
 c.append(el('p','',entry.notes||'Няма добавена бележка.'));
 return c;
}
let activeLiveTimer=null;
function mountLive(root){
 const title=[...root.querySelectorAll('.main h1,.main h2')].find(h=>/^(Live Call Desk|Live Desk)$/.test(h.textContent?.trim()||''));
 if(!title)return;
 const host=title.closest('.main');
 if(!host||host.querySelector('#sf-sales-meeting'))return;
 const shell=el('section','card sf-sales-shell');shell.id='sf-sales-meeting';
 const header=el('div','sf-sales-header');header.append(el('h2','','☎ DAVID · Phone Meeting'));
 const badge=el('span','tag gray','Готовност');header.append(badge);shell.append(header);
 const grid=el('div','sf-sales-grid');
 const call=el('div','sf-sales-phone');
 const companyName=el('h3','','Очаквам фирма');
 const client=el('div','sf-sales-client','Клиент: —');
 const operator=el('div','sf-sales-operator','Оператор: —');
 const david=el('div','sf-sales-david','DAVID: Ще предложа точните думи след разрешена клиентска реплика.');
 const timeline=el('div','sf-sales-timeline');timeline.setAttribute('aria-live','polite');
 const phoneActions=el('div','sf-sales-phone-actions');
 const dial=el('button','btn green','☎ Набери'),record=el('button','btn sf-record-btn','⏺ Запис'),hold=el('button','btn sf-hold-btn','⏸ Задържане'),transfer=el('button','btn sf-transfer-btn','⇄ Прехвърляне'),hangup=el('button','btn red','■ Затвори');
 for(const btn of [dial,record,hold,transfer,hangup])btn.type='button';
 dial.disabled=false;record.disabled=hold.disabled=transfer.disabled=hangup.disabled=true;
 let conferenceEnabled=false,callOnHold=false;
 const syncControls=()=>{
  dial.disabled=connecting||!!callingCall;
  hangup.disabled=!callingCall;
  record.disabled=!callingCall||!!browserRecording?.uploading||!!browserRecording?.recorder&&browserRecording.recorder.state==='inactive';
  record.textContent=browserRecordingActive()?'⏹ Спри запис':'⏺ Запис';
  hold.disabled=!callingCall||!conferenceEnabled;
  transfer.disabled=!callingCall||!conferenceEnabled;
  hold.textContent=callOnHold?'▶ Върни':'⏸ Задържане';
 };
 const telephoneStatus=el('p','sf-sales-call-status','Само разрешени задачи и номера от DAVID. Нужни са Twilio credentials и разрешен микрофон.');
 const preflightButton=el('button','btn subtle','Провери Twilio');
 preflightButton.type='button';
 preflightButton.addEventListener('click',async()=>{
  preflightButton.disabled=true;
  telephoneStatus.textContent='Свързване с Twilio за проверка, без обаждане...';
  try{
   const result=await api(endp('task-preflight'));
   telephoneStatus.textContent=preflightMessage(result);
  }catch(error){telephoneStatus.textContent='Проверка неуспешна: '+error.message}
  finally{preflightButton.disabled=false}
 });
 const setCallStatus=msg=>{telephoneStatus.textContent=msg;syncControls();};
 dial.addEventListener('click',async()=>{
  dial.disabled=true;
  try{await startApprovedCall(setCallStatus);}catch(error){setCallStatus(String(error?.message||error));}
  finally{syncControls();}
 });
 hangup.addEventListener('click',()=>{if(endApprovedCall())setCallStatus('Прекратяване на обаждането...')});
 record.addEventListener('click',async()=>{
  record.disabled=true;
  try{if(browserRecordingActive()){stopBrowserRecording();setCallStatus('Спирам и качвам записа...')}
   else await beginBrowserRecording(setCallStatus,syncControls)}
  catch(error){setCallStatus('Записът не започна: '+error.message)}
  finally{syncControls()}
 });
 hold.addEventListener('click',async()=>{
  if(!callingCall)return;hold.disabled=true;
  try{const result=await api(endp('task-hold'),'POST',{call_sid:callingCall.parameters?.CallSid,hold:!callOnHold});
   callOnHold=result.hold===true;
   const rec=browserRecording?.recorder;
   if(rec?.state==='recording'&&callOnHold)rec.pause();
   if(rec?.state==='paused'&&!callOnHold)rec.resume();
   setCallStatus(callOnHold?'⏸ Клиентът е задържан. Записът е паузиран.':'▶ Разговорът продължава.')}
  catch(error){setCallStatus('Задържането не е изпълнено: '+error.message)}
  finally{syncControls()}
 });
 transfer.addEventListener('click',async()=>{
  if(!callingCall)return;
  const number=window.prompt('Номер за прехвърляне, предварително разрешен от администратор (+359...)','');
  if(!number||!window.confirm('Прехвърли към '+number+'? Twilio начислява отделна такса.'))return;
  transfer.disabled=true;
  try{const result=await api(endp('task-transfer'),'POST',{call_sid:callingCall.parameters?.CallSid,destination:number});
   setCallStatus(result.success?'Новият номер звъни. Прехвърляне след успешно свързване.':'Прехвърлянето не успя.')}
  catch(error){setCallStatus('Прехвърлянето не е изпълнено: '+error.message)}
  finally{syncControls()}
 });
 phoneActions.append(dial,record,hold,transfer,hangup);
 call.append(companyName,client,operator,david,timeline,phoneActions,preflightButton,telephoneStatus);
 const right=el('aside','sf-sales-right');
 right.append(el('h3','','Последни бележки за бизнеса'));
 const companyNote=el('div','sf-sales-notes');companyNote.append(el('p','muted','Бележките се появяват само за назначената фирма.'));
 right.append(companyNote);
 grid.append(call,right);shell.append(grid);
 const outcomePanel=el('div','sf-sales-outcome');outcomePanel.hidden=true;
 outcomePanel.append(el('h3','','Резултат от приключилия разговор'));
 const summary=el('p','muted','');
 const options=el('div','sf-sales-options');
 const buttons=new Map();let choice=null,currentSid=null;
 for(const [key,label] of Object.entries(statusLabels)){
  const b=el('button','btn sf-sales-choice',statusIcons[key]+' '+label);
  b.type='button';b.setAttribute('aria-pressed','false');
  b.addEventListener('click',()=>{
   choice=key;
   for(const [k,x] of buttons){x.classList.toggle('selected',k===key);x.setAttribute('aria-pressed',String(k===key));}
  });
  buttons.set(key,b);options.append(b);
 }
 const notesLabel=el('label','','Бележка към бизнеса');
 const notes=el('textarea','field');
 notes.rows=4;notes.maxLength=3000;notes.placeholder='Какво отговори клиентът, какво беше важно и каква е следващата стъпка?';
 notesLabel.append(notes);
 const confirm=el('button','btn primary','OK · Запази към Моите фирми');
 confirm.type='button';
 const message=el('p','muted','');
 confirm.addEventListener('click',async()=>{
  if(!choice){message.textContent='Избери резултат над бележката.';return}
  if(!currentSid){message.textContent='Няма потвърден Twilio разговор.';return}
  confirm.disabled=true;message.textContent='Записване в Supabase...';
  try{
   await api(endp('call-outcome'),'POST',{call_sid:currentSid,disposition:choice,notes:notes.value});
   outcomePanel.hidden=true;message.textContent='✓ Запазено.';
   const menu=[...document.querySelectorAll('[data-nav="mycompanies"]')].find(b=>b.offsetParent!==null)||document.querySelector('[data-nav="mycompanies"]');
   if(menu)menu.click();
  }catch(error){message.textContent='Не е записано: '+error.message}
  finally{confirm.disabled=false}
 });
 outcomePanel.append(summary,options,notesLabel,confirm,message);
 shell.append(outcomePanel);
 title.insertAdjacentElement('afterend',shell);
 let lastActive=false,lastNoteSignature='',busy=false,lastRecent=0,lastOutcomeScrolled=null;
 function renderLines(lines){
  timeline.replaceChildren();
  const recent=(lines||[]).slice(-8);
  for(const line of recent){
   const row=el('div','sf-sales-line '+(line.speaker==='client'?'client':'operator'));
   row.append(el('strong','',line.speaker==='client'?'Клиент: ':'Оператор: '),document.createTextNode(line.content));
   timeline.append(row);
   if(line.david_hint){const a=el('div','sf-sales-hint');a.append(el('strong','','DAVID: '),document.createTextNode(line.david_hint));timeline.append(a);}
  }
 }
 async function refresh(){
  if(!shell.isConnected||busy)return;busy=true;
  try{
   const x=await api(endp('live-status'));
   conferenceEnabled=!!x.conference_controls_enabled;
   callOnHold=!!x.on_hold;
   syncControls();
   if(activeCallStatus)telephoneStatus.textContent=activeCallStatus;
   badge.textContent=x.active?(x.state==='in-progress'?'● В разговор':'◉ Набиране'):'Няма активен разговор';
   badge.className='tag '+(x.active?'green':'gray');
   if(x.active){
    lastActive=true;
    companyName.textContent=x.company?.company_name||'Обаждане без фирма';
    client.textContent='Клиент: '+(x.latest_customer_line||'Очаквам реплика...');
    operator.textContent='Оператор: '+(x.latest_operator_line||'Очаквам реч...');
    david.textContent='DAVID: '+(x.suggestion||'Очаквам разрешена клиентска реплика, за да предложа отговор.');
    renderLines(x.transcript);
    const newNotes=JSON.stringify(x.recent_notes||[]);
    if(newNotes!==lastNoteSignature){
     lastNoteSignature=newNotes;companyNote.replaceChildren();
     if(x.recent_notes?.length)for(const n of x.recent_notes)companyNote.append(noteCard(n));
     else companyNote.append(el('p','muted','Няма предишни бележки за този бизнес.'));
    }
    outcomePanel.hidden=true;
   }else{
    companyName.textContent='Телефонът е свободен';
    client.textContent='Клиент: —';operator.textContent='Оператор: —';
    david.textContent='DAVID: Очаквам следващото обаждане.';
    if(Date.now()-lastRecent>7500||lastActive){
     lastRecent=Date.now();lastActive=false;
     const records=await api(endp('call-records'));
     const latest=(records.calls||[]).find(c=>
      ['completed','failed','canceled'].includes(c.state)&&c.ended_at&&!c.outcome&&
      c.company?.company_name&&Date.now()-new Date(c.ended_at).getTime()<86400000
     );
     if(latest&&latest.call_sid!==currentSid){choice=null;notes.value='';message.textContent='';for(const b of buttons.values()){b.classList.remove('selected');b.setAttribute('aria-pressed','false')}}
     currentSid=latest?.call_sid||null;
     outcomePanel.hidden=!latest;
     if(latest){summary.textContent=(latest.company?.company_name||'Фирма')+' · '+date(latest.ended_at)+' · '+latest.state;if(lastOutcomeScrolled!==latest.call_sid){lastOutcomeScrolled=latest.call_sid;outcomePanel.scrollIntoView({behavior:'smooth',block:'start'});}}
    }
   }
  }catch(error){badge.textContent='Live: '+error.message;badge.className='tag orange'}
  finally{busy=false;}
 }
 refresh();
 const timer=setInterval(()=>{if(!shell.isConnected){clearInterval(timer);return;}if(document.visibilityState==='visible'&&shell.offsetParent!==null)refresh()},1700);
}
function mountCompanies(root){
 const title=[...root.querySelectorAll('.main h1,.main h2')].find(h=>h.textContent?.trim()==='Моите фирми');
 if(!title)return;
 const host=title.closest('.main');if(!host||host.querySelector('#sf-company-call-history'))return;
 const section=el('section','card sf-company-history');section.id='sf-company-call-history';
 const head=el('div','sf-sales-header');head.append(el('h2','','📋 Разговори и бележки към моите фирми'));
 const refresh=el('button','btn subtle','↻ Обнови');head.append(refresh);section.append(head);
 const items=el('div','sf-sales-items');section.append(items);
 title.insertAdjacentElement('afterend',section);
 let loading=false;
 async function load(){
  if(loading||!section.isConnected)return;loading=true;refresh.disabled=true;items.replaceChildren(el('p','muted','Зареждане на потвърдените разговори...'));
  try{
   const data=await api(endp('company-history'));
   if(!section.isConnected)return;
   items.replaceChildren();
   if(!data.history?.length){items.append(el('p','muted','Няма запазени разговори с резултат за назначените фирми.'));return}
   const names=new Map((data.companies||[]).map(c=>[c.id,c.company_name]));
   for(const h of data.history){
    const card=el('article','sf-sales-item');
    card.append(el('h3','',names.get(h.company_id)||'Фирма'),el('p','muted',date(h.updated_at)));
    card.append(noteCard(h));
    const row=el('div','sf-sales-row');
    const transcript=el('button','btn subtle','💬 Разговор и DAVID');
    transcript.addEventListener('click',()=>openTranscript(h.call_sid,transcript));
    const trainer=el('button','btn primary','✦ DAVID: Обучи ме');
    const feedback=el('div','sf-sales-feedback');feedback.hidden=true;
    trainer.addEventListener('click',async()=>{
     trainer.disabled=true;feedback.hidden=false;feedback.textContent='DAVID анализира разговора и бележката...';
     try{
      const answer=await api('/api/soulflame-ai','POST',{
       mode:'sales_coach',company_id:h.company_id,
       message:'Прегледай реалните ми предишни бележки и разрешената транскрипция за тази фирма. Дай ми практически съвет за следващия разговор и кратка положителна обратна връзка.'
      });
      feedback.textContent='DAVID: '+answer.reply;
     }catch(error){feedback.textContent='DAVID: '+error.message}
     finally{trainer.disabled=false}
    });
    row.append(transcript,trainer);card.append(row,feedback);items.append(card);
   }
  }catch(error){items.replaceChildren(el('p','muted','Неуспешно зареждане: '+error.message))}
  finally{loading=false;refresh.disabled=false}
 }
 refresh.addEventListener('click',load);load();
}
function mountAdmin(root){
 const title=[...root.querySelectorAll('.main h1,.main h2')].find(h=>h.textContent?.trim()==='Admin Panel');
 if(!title)return;
 const host=title.closest('.main');if(!host||host.querySelector('#sf-admin-call-inbox'))return;
 const section=el('section','card sf-admin-call-inbox');section.id='sf-admin-call-inbox';
 const header=el('div','sf-sales-header');header.append(el('h2','','DAVID · Admin Call Inbox'));
 const counters=el('strong','','New Audio: 0 · New Chat: 0');
 const reload=el('button','btn subtle','↻ Обнови');header.append(counters,reload);section.append(header);
 const details=el('p','muted','Администраторите виждат всички реални разговори. Операторът вижда само текст и собствените бележки.');
 section.append(details);
 const list=el('div','sf-sales-items');section.append(list);
 title.insertAdjacentElement('afterend',section);
 let busy=false;
 async function load(){
  if(busy||!section.isConnected)return;busy=true;reload.disabled=true;
  try{
   const data=await api(endp('admin-inbox'));
   counters.textContent='New Audio: '+(data.unread_audio||0)+' · New Chat: '+(data.unread_chat||0);
   list.replaceChildren();
   if(!data.calls?.length){list.append(el('p','muted','Няма реални входящи записи.'));return}
   for(const c of data.calls){
    const card=el('article','sf-sales-item');
    card.append(el('strong','',c.worker_name+' · '+(c.company?.company_name||'Фирма не е избрана')),el('p','muted',date(c.started_at)+' · '+c.state));
    const actions=el('div','sf-sales-row');
    const chat=el('button','btn subtle',(c.new_chat?'● New Chat':'💬 Chat')+(c.has_chat?'':' (без транскрипция)'));
    chat.disabled=!c.has_chat;
    chat.addEventListener('click',()=>{openTranscript(c.call_sid,chat);c.new_chat=false;setTimeout(load,700)});
    const audio=el('button','btn subtle',(c.new_audio?'● New Audio':'🎧 Audio')+(c.has_audio?'':' (няма запис)'));
    audio.disabled=!c.has_audio;
    audio.addEventListener('click',()=>openTranscript(c.call_sid,audio));
    const note=el('button','btn subtle','Пълен запис');
    note.addEventListener('click',()=>openTranscript(c.call_sid,note));
    actions.append(chat,audio,note);card.append(actions);list.append(card);
   }
  }catch(error){list.replaceChildren(el('p','muted','Админ опашката не е достъпна: '+error.message))}
  finally{busy=false;reload.disabled=false}
 }
 reload.addEventListener('click',load);load();
}
let scheduled=false;
const observer=new MutationObserver(()=>{
 if(scheduled)return;scheduled=true;
 queueMicrotask(()=>{
  scheduled=false;const root=document.getElementById('root');
  if(root){mountLive(root);mountCompanies(root);mountAdmin(root)}
 });
});
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
const css=el('style');
css.textContent=`
.sf-sales-shell,.sf-company-history,.sf-admin-call-inbox{margin:16px 0}
.sf-sales-header,.sf-sales-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.sf-sales-header h2{margin:0}
.sf-sales-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,.95fr);gap:16px;margin-top:16px}
.sf-sales-phone{background:#f4f8ff;border:1px solid #d7e5f8;border-radius:18px;padding:18px;min-height:280px}
.sf-sales-phone h3{font-size:22px;margin:0 0 14px}
.sf-sales-client,.sf-sales-operator{padding:11px;background:white;border:1px solid #d8e5f5;border-radius:12px;margin:8px 0;line-height:1.5}
.sf-sales-david,.sf-sales-hint{padding:15px;background:#e0f8ea;color:#14553b;border-radius:12px;line-height:1.6;font-weight:650}
.sf-sales-david{font-size:clamp(16px,2vw,22px)}
.sf-sales-timeline{max-height:280px;overflow-y:auto;margin:13px 0}
.sf-sales-line{background:white;border-radius:10px;padding:10px;margin:6px 0;line-height:1.5}
.sf-sales-line.client{background:#fff5e6}
.sf-sales-phone-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:16px auto}
.sf-sales-phone-actions button{min-width:0;max-width:none;min-height:48px;font-size:14px;white-space:normal;padding:8px 5px}
.sf-record-btn{background:#ffebed!important;color:#9d1f2a!important;border:1px solid #efb8bb!important}
.sf-hold-btn{background:#fff1ce!important;color:#805505!important;border:1px solid #e8cb8b!important}
.sf-transfer-btn{background:#e6eaff!important;color:#343c9a!important;border:1px solid #bec5ee!important}
.sf-sales-call-status{font-size:13px;color:#476383;margin:6px 0 0;overflow-wrap:anywhere}
.main:has(#sf-sales-meeting)>.dock{display:none!important}
.sf-sales-right{background:white;border:1px solid #dbe7f5;padding:14px;border-radius:14px;overflow:auto;max-height:560px}
.sf-sales-right h3{margin:0 0 12px}
.sf-sale-note{border:1px solid #e1e9f5;border-radius:12px;padding:12px;margin:8px 0;background:#fbfdff}
.sf-sale-note small{display:block;color:#5c7190;margin:5px 0}.sf-sale-note p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0}
.sf-sales-outcome{border-top:1px solid #d8e4f3;margin-top:18px;padding-top:15px}
.sf-sales-outcome[hidden],.sf-sales-feedback[hidden]{display:none!important}
.sf-sales-options{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0 15px}
.sf-sales-choice{border:1px solid #b9cbe5;background:#fff;color:#19345d}
.sf-sales-choice.selected{background:#176fff!important;color:white!important;border-color:#176fff}
.sf-sales-outcome label{display:block;font-weight:600;margin-bottom:12px}
.sf-sales-outcome textarea{display:block;min-height:110px;margin-top:8px}
.sf-sales-items{display:grid;gap:12px;margin-top:14px}
.sf-sales-item{padding:15px;border:1px solid #d8e4f2;border-radius:13px;background:#fff}
.sf-sales-item h3{margin:0}.sf-sales-feedback{margin-top:12px;padding:12px;border-radius:10px;background:#e5f5ff;white-space:pre-wrap;line-height:1.6}
@media(max-width:780px){.sf-sales-grid{grid-template-columns:1fr}.sf-sales-phone{padding:12px}.sf-sales-phone-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-sales-phone-actions button{max-width:none}.sf-sales-right{max-height:240px}.sf-sales-options .btn{flex:1 1 100%}}
`;
document.head.append(css);
const root=document.getElementById('root');if(root){mountLive(root);mountCompanies(root);mountAdmin(root)}
