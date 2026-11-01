// DAVID unified post-call workflow. Existing navigation and Twilio dial buttons remain authoritative.
// Every list is filled only from authenticated, real server records. No fake call or audio content.
import {createClient} from '@supabase/supabase-js';
import {Device} from '@twilio/voice-sdk';
import {finalizeBrowserAudio,formatAudioClock} from './david-audio-completeness.mjs';
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
  let finished=false;
  const finish=()=>{
   if(finished)return;
   finished=true;
   // Remote and local hang-up must emit exactly one post-call event.
   stopBrowserRecording('call_ended');
   const sid=String(call.parameters?.CallSid||'');
   if(callingCall===call)callingCall=null;
   if(callingDevice===dev){try{dev.destroy()}catch{}callingDevice=null;}
   activeCallStatus='✓ Call ended · Разговорът приключи. Попълни резултата и бележката.';
   status(activeCallStatus);
   document.dispatchEvent(new CustomEvent('david:call-ended',{detail:{
    callSid:/^CA[0-9a-f]{32}$/i.test(sid)?sid:null,endedAt:Date.now()
   }}));
  };
  call.on('ringing',()=>{activeCallStatus='☎ Звъни...';status(activeCallStatus)});
  call.on('accept',()=>{activeCallStatus='● Свързано. Поискай съгласие и натисни ⏺ Запис, за да запишеш всичко до Call ended.';status(activeCallStatus)});
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
async function currentLiveSid(){
 const clientSid=String(callingCall?.parameters?.CallSid||'');
 if(/^CA[0-9a-f]{32}$/i.test(clientSid))return clientSid;
 const live=await api(endp('live-status'));
 if(live.active&&/^CA[0-9a-f]{32}$/i.test(live.call_sid))return live.call_sid;
 throw Error('Няма потвърден Call SID за активния разговор');
}
async function beginBrowserRecording(status,updateControls){
 if(browserRecordingActive()||browserRecording?.uploading)throw Error('Вече има активен запис или качване');
 if(!callingCall||callingCall.status()!=='open')throw Error('Няма свързан разговор');
 if(typeof MediaRecorder==='undefined')throw Error('Браузърът не поддържа MediaRecorder');
 const local=callingCall.getLocalStream(),remote=callingCall.getRemoteStream();
 if(!local?.getAudioTracks().length||!remote?.getAudioTracks().length)throw Error('Няма звук и от двете страни. Не започвам непълен запис.');
 const sid=await currentLiveSid();
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
 const entry={recorder,ctx,mix,upload,uploading:false,startedMono:0,stopReason:null};
 browserRecording=entry;
 recorder.ondataavailable=e=>{
  if(e.data?.size){chunks.push(e.data);bytes+=e.data.size}
  if(bytes>26214400&&recorder.state!=='inactive'){status('25 MB лимит. Спирам записа.');entry.stopReason='limit';recorder.stop()}
 };
 recorder.onerror=e=>status('Грешка от браузърния recorder: '+(e.error?.message||'audio_error'));
 recorder.onstop=async()=>{
  entry.uploading=true;updateControls();
  const elapsedMs=Math.max(1,Math.round(performance.now()-(entry.startedMono||performance.now())));
  try{await ctx.close()}catch{}
  for(const track of mix.stream.getTracks())track.stop();
  if(!chunks.length){status('Няма аудиоданни. Нищо не е запазено.');entry.uploading=false;updateControls();return}
  const captured=new Blob(chunks,{type:mimeType});
  const blob=await finalizeBrowserAudio(captured,elapsedMs);
  if(blob.size>26214400){status('Записът е над лимита 25 MB.');entry.uploading=false;updateControls();return}
  status('Качвам двата гласа в частното хранилище на DAVID...');
  try{
   const {error}=await client.storage.from(upload.bucket).uploadToSignedUrl(upload.path,upload.token,blob,{contentType:mimeType});
   if(error)throw error;
   const result=await api(endp('browser-record-complete'),'POST',{
    recording_id:upload.recording_id,duration_ms:elapsedMs,
    ended_reason:entry.stopReason||'track_ended'
   });
   if(!result.saved)throw Error('Сървърът не потвърди запис');
   status('✓ Целият заснет звук ('+formatAudioClock(elapsedMs)+') е запазен в Supabase. Аудиото е достъпно само за администратори.');
  }catch(e){status('Записът не се съхрани: '+e.message+'. Няма да твърдим, че е качен.')}
  finally{entry.uploading=false;if(browserRecording===entry)browserRecording=null;updateControls()}
 };
 recorder.start(1000);
 entry.startedMono=performance.now();
 status('🔴 Записвам двата гласа непрекъснато след съгласието, до Call ended. Не затваряй страницата.');
 updateControls();return true;
}
function stopBrowserRecording(reason='call_ended'){
 const entry=browserRecording,rec=entry?.recorder;
 if(!rec||rec.state==='inactive')return false;
 entry.stopReason=reason;
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
  if(browserRecordingActive()&&browserRecording?.startedMono>0){
   recordClock.textContent='🔴 Записва непрекъснато · '+formatAudioClock(performance.now()-browserRecording.startedMono)+' от потвърденото съгласие до края на разговора.';
  }else if(browserRecording?.uploading){recordClock.textContent='⌛ Качвам целия запис в частното хранилище...'}
  dial.disabled=connecting||!!callingCall;
  hangup.disabled=!callingCall;
  record.disabled=!callingCall||!!browserRecording?.uploading||!!browserRecording?.recorder&&browserRecording.recorder.state==='inactive';
  record.textContent=browserRecordingActive()?'⏹ Спри запис':'⏺ Запис';
  hold.disabled=!callingCall||!conferenceEnabled;
  transfer.disabled=!callingCall||!conferenceEnabled;
  hold.textContent=callOnHold?'▶ Върни':'⏸ Задържане';
 };
 const telephoneStatus=el('p','sf-sales-call-status','Само разрешени задачи и номера от DAVID. Нужни са Twilio credentials и разрешен микрофон.');
 const recordClock=el('p','sf-sales-record-clock','Записът започва след съгласие и продължава до Call ended.');
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
  dialAttemptAt=Date.now();
  dial.disabled=true;
  try{await startApprovedCall(setCallStatus);}catch(error){setCallStatus(String(error?.message||error));}
  finally{syncControls();}
 });
 hangup.addEventListener('click',()=>{if(endApprovedCall())setCallStatus('Прекратяване на обаждането...')});
 record.addEventListener('click',async()=>{
  record.disabled=true;
  try{if(browserRecordingActive()){
    if(!window.confirm('Ако спреш сега, записът ще бъде частичен и няма да съдържа остатъка от разговора. Сигурен ли си?'))return;
    stopBrowserRecording('manual_stop');setCallStatus('Спирам и качвам частичния запис...')}
   else await beginBrowserRecording(setCallStatus,syncControls)}
  catch(error){setCallStatus('Записът не започна: '+error.message)}
  finally{syncControls()}
 });
 hold.addEventListener('click',async()=>{
  if(!callingCall)return;hold.disabled=true;
  try{const result=await api(endp('task-hold'),'POST',{call_sid:await currentLiveSid(),hold:!callOnHold});
   callOnHold=result.hold===true;
   setCallStatus(callOnHold?'⏸ Клиентът е задържан. Записът продължава непрекъснато.':'▶ Разговорът продължава и записът продължава.')}
  catch(error){setCallStatus('Задържането не е изпълнено: '+error.message)}
  finally{syncControls()}
 });
 transfer.addEventListener('click',async()=>{
  if(!callingCall)return;
  const number=window.prompt('Номер за прехвърляне, предварително разрешен от администратор (+359...)','');
  if(!number||!window.confirm('Прехвърли към '+number+'? Twilio начислява отделна такса.'))return;
  transfer.disabled=true;
  try{const result=await api(endp('task-transfer'),'POST',{call_sid:await currentLiveSid(),destination:number});
   setCallStatus(result.success?'Новият номер звъни. Прехвърляне след успешно свързване.':'Прехвърлянето не успя.')}
  catch(error){setCallStatus('Прехвърлянето не е изпълнено: '+error.message)}
  finally{syncControls()}
 });
 phoneActions.append(dial,record,hold,transfer,hangup);
 call.append(companyName,client,operator,david,timeline,phoneActions,preflightButton,telephoneStatus,recordClock);
 const right=el('aside','sf-sales-right');
 right.append(el('h3','','Последни бележки за бизнеса'));
 const companyNote=el('div','sf-sales-notes');companyNote.append(el('p','muted','Бележките се появяват само за назначената фирма.'));
 right.append(companyNote);
 grid.append(call,right);shell.append(grid);
 const outcomePanel=el('div','sf-sales-outcome');outcomePanel.hidden=true;
 const outcomeTitle=el('h3','','Резултат от приключилия разговор');
 outcomePanel.append(outcomeTitle);
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
 const backToDesk=el('button','btn subtle sf-back-to-phone','↩ Обратно към телефона');
 backToDesk.type='button';
 outcomePanel.append(summary,options,notesLabel,confirm,message,backToDesk);
 shell.append(outcomePanel);
 title.insertAdjacentElement('afterend',shell);
 let lastActive=false,lastNoteSignature='',busy=false,lastRecent=0,lastOutcomeScrolled=null;
 let awaitingEnd=false,endedEventAt=0,pendingCallSid=null,lastLiveSid=null,dialAttemptAt=0,dismissedCallSid=null;
 const jumpToResult=()=>{
  if(!outcomePanel.isConnected)return;
  outcomePanel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 };
 const showEndedWaiting=()=>{
  awaitingEnd=true;endedEventAt=Date.now();
  grid.hidden=true;outcomePanel.hidden=false;
  outcomeTitle.textContent='✓ Call ended · Резултат от приключилия разговор';
  summary.textContent='Разговорът приключи. Зареждам фирмата и данните за бележката...';
  options.hidden=true;notesLabel.hidden=true;confirm.hidden=true;
  confirm.disabled=true;
  message.textContent='Проверявам завършения разговор в системата...';
  badge.textContent='✓ Call ended';badge.className='tag green';
  setCallStatus('✓ Call ended · Разговорът приключи.');
  jumpToResult();
 };
 const openEndedResult=c=>{
  awaitingEnd=false;grid.hidden=true;outcomePanel.hidden=false;
  outcomeTitle.textContent='✓ Call ended · Резултат от приключилия разговор';
  options.hidden=false;notesLabel.hidden=false;confirm.hidden=false;confirm.disabled=false;
  badge.textContent='✓ Call ended';badge.className='tag green';
  if(c.call_sid!==currentSid){
   choice=null;notes.value='';message.textContent='';
   for(const b of buttons.values()){b.classList.remove('selected');b.setAttribute('aria-pressed','false')}
  }
  currentSid=c.call_sid;
  summary.textContent=(c.company?.company_name||'Фирма')+' · '+date(c.ended_at)+' · '+c.state;
  if(lastOutcomeScrolled!==c.call_sid){
   lastOutcomeScrolled=c.call_sid;
   jumpToResult();
  }
 };
 const handleEndEvent=event=>{
  if(!shell.isConnected)return;
  pendingCallSid=sidOk(event.detail?.callSid)?event.detail.callSid:lastLiveSid;
  showEndedWaiting();
  refresh();
 };
 document.addEventListener('david:call-ended',handleEndEvent);
 backToDesk.addEventListener('click',()=>{
  if(currentSid&&!confirm.hidden&&notes.value.trim()&&!window.confirm('Бележката не е запазена. Да се върнем ли към телефона?'))return;
  dismissedCallSid=currentSid||pendingCallSid;
  awaitingEnd=false;pendingCallSid=null;
  outcomePanel.hidden=true;grid.hidden=false;
  badge.textContent='Няма активен разговор';badge.className='tag gray';
 });
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
  if(!shell.isConnected||busy)return;
  busy=true;
  try{
   const x=await api(endp('live-status'));
   conferenceEnabled=!!x.conference_controls_enabled;
   callOnHold=!!x.on_hold;
   syncControls();
   if(x.active){
    lastActive=true;lastLiveSid=sidOk(x.call_sid)?x.call_sid:lastLiveSid;
    if(!awaitingEnd){
     grid.hidden=false;outcomePanel.hidden=true;
     badge.textContent=x.state==='in-progress'?'● В разговор':'◉ Набиране';
     badge.className='tag green';
    }
    companyName.textContent=x.company?.company_name||'Обаждане без фирма';
    client.textContent='Клиент: '+(x.latest_customer_line||'Очаквам реплика...');
    operator.textContent='Оператор: '+(x.latest_operator_line||'Очаквам реч...');
    david.textContent='DAVID: '+(x.suggestion||'Очаквам разрешена клиентска реплика, за да предложа отговор.');
    renderLines(x.transcript);
    const recentNotes=JSON.stringify(x.recent_notes||[]);
    if(recentNotes!==lastNoteSignature){
     lastNoteSignature=recentNotes;companyNote.replaceChildren();
     if(x.recent_notes?.length)for(const n of x.recent_notes)companyNote.append(noteCard(n));
     else companyNote.append(el('p','muted','Няма предишни бележки за този бизнес.'));
    }
   }else{
    if(lastActive&&!awaitingEnd&&lastLiveSid&&lastLiveSid!==dismissedCallSid){
     pendingCallSid=lastLiveSid;
     showEndedWaiting();
    }
    lastActive=false;
    companyName.textContent='Телефонът е свободен';
    client.textContent='Клиент: —';
    operator.textContent='Оператор: —';
    david.textContent='DAVID: Очаквам следващото обаждане.';
    const due=awaitingEnd||Date.now()-lastRecent>5000;
    if(due){
     lastRecent=Date.now();
     const records=await api(endp('call-records'));
     const candidates=(records.calls||[]).filter(c=>
      ['completed','failed','canceled'].includes(c.state)&&c.ended_at&&!c.outcome&&
      c.company?.company_name&&Date.now()-new Date(c.ended_at).getTime()<86400000
     );
     const latest=awaitingEnd?
      (pendingCallSid?candidates.find(c=>c.call_sid===pendingCallSid):
       candidates.find(c=>new Date(c.ended_at).getTime()>dialAttemptAt-15000)):
      candidates.find(c=>c.call_sid!==dismissedCallSid);
     if(latest){
      openEndedResult(latest);
      pendingCallSid=null;
      if(!endedEventAt){grid.hidden=false;outcomePanel.hidden=false}
     }else if(awaitingEnd){
      grid.hidden=true;outcomePanel.hidden=false;
      badge.textContent='✓ Call ended';badge.className='tag green';
      if(Date.now()-endedEventAt>25000){
       summary.textContent='Call ended · Очаквам потвърждение от Twilio';
       message.textContent='Разговорът е прекъснат, но сървърът още не е потвърдил завършения запис. Провери отново след малко.';
      }
     }else if(!currentSid||currentSid===dismissedCallSid){
      grid.hidden=false;outcomePanel.hidden=true;
      badge.textContent='Няма активен разговор';badge.className='tag gray';
     }
    }
   }
  }catch(error){
   if(awaitingEnd)message.textContent='Call ended · Проверка на приключването: '+error.message;
   else{badge.textContent='Live: '+error.message;badge.className='tag orange'}
  }finally{busy=false}
 }
 refresh();
 const timer=setInterval(()=>{if(!shell.isConnected){clearInterval(timer);document.removeEventListener('david:call-ended',handleEndEvent);return;}if(document.visibilityState==='visible'&&shell.offsetParent!==null)refresh()},1700);
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
const exactTime=value=>value?new Date(value).toLocaleString('bg-BG',{
 timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
}):'—';
const elapsed=seconds=>{
 if(!Number.isFinite(seconds)||seconds<0)return '—';
 const total=Math.floor(seconds);
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
};


function mountAdmin(root){
 const title=[...root.querySelectorAll('.main h1,.main h2')].find(h=>h.textContent?.trim()==='Admin Panel');
 if(!title)return;
 const host=title.closest('.main');if(!host||host.querySelector('#sf-admin-call-inbox'))return;
 const section=el('section','card sf-admin-call-inbox');section.id='sf-admin-call-inbox';
 const header=el('div','sf-sales-header');header.append(el('h2','','☎ DAVID · Admin Call Records'));
 const counters=el('strong','','Общо: 0 · Аудио: 0 · Нови: 0');
 const refresh=el('button','btn subtle','↻ Обнови');refresh.type='button';
 header.append(counters,refresh);section.append(header);
 section.append(el('p','muted','Всички разговори в една таблица. Натисни ред за подробности, транскрипция, бележки и защитен аудиоплейър.'));
 const tools=el('div','sf-admin-call-filters');
 const search=el('input','field');search.type='search';
 search.placeholder='Търси оператор, Gmail, телефон, фирма или бележка';
 search.setAttribute('aria-label','Търсене в администраторските разговори');
 const audioFilter=el('label','sf-admin-audio-filter');
 const onlyAudio=el('input');onlyAudio.type='checkbox';
 audioFilter.append(onlyAudio,document.createTextNode(' Само със запис'));
 tools.append(search,audioFilter);section.append(tools);
 const wrap=el('div','sf-admin-call-table-wrap');
 wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица с реалните разговори на DAVID');
 wrap.tabIndex=0;
 const table=el('table','sf-admin-call-table');
 const caption=el('caption','sf-admin-call-table-caption','История на разговорите в DAVID');
 table.append(caption);
 const thead=el('thead');
 const headings=el('tr');
 for(const name of ['Дата и час','Оператор','Клиент / фирма','Разговор','Аудио','Резултат','Статус','Действие']){
  const th=el('th','',name);th.scope='col';headings.append(th);
 }
 thead.append(headings);
 const tbody=el('tbody');table.append(thead,tbody);wrap.append(table);section.append(wrap);
 const empty=el('p','muted sf-admin-table-empty','Все още няма реални разговори.');empty.hidden=true;section.append(empty);
 title.insertAdjacentElement('afterend',section);
 let loading=false,latest=[],lastFetch=0;
 function openDetails(call,trigger){
  if(!/^CA[0-9a-f]{32}$/i.test(String(call.call_sid||'')))return;
  // The shared DAVID modal fetches the authoritative record and admin-only audio.
  // Never send stored audio URLs, tokens or file bytes through a UI event.
  document.dispatchEvent(new CustomEvent('david:open-call',{detail:{
   sid:call.call_sid,trigger,autoLoadAudio:!!call.has_audio,
   overview:{
    worker_name:call.worker_name||'Оператор',
    worker_email:call.worker_email||'',
    dialed_number:call.dialed_number||'',
    duration_seconds:call.duration_seconds,
    call_provider_status:call.call_provider_status||''
   }
  }}));
 }
 function rowCell(row,label,text,className=''){
  const td=el('td',className,text);td.setAttribute('data-label',label);row.append(td);return td;
 }
 function render(){
  if(!section.isConnected)return;
  const term=search.value.trim().toLocaleLowerCase('bg-BG');
  const filtered=latest.filter(c=>{
   if(onlyAudio.checked&&!c.has_audio)return false;
   const searchable=[c.worker_name,c.worker_email,c.company?.company_name,c.company?.contact_name,
    c.dialed_number,c.outcome?.notes,c.outcome?.disposition,c.state].filter(Boolean).join(' ').toLocaleLowerCase('bg-BG');
   return !term||searchable.includes(term);
  });
  tbody.replaceChildren();
  empty.hidden=filtered.length>0;
  empty.textContent=latest.length?'Няма разговори по този филтър.':'Все още няма реални разговори.';
  table.hidden=filtered.length===0;
  for(const c of filtered){
   const tr=el('tr','sf-admin-call-table-row');
   const started=rowCell(tr,'Дата и час',exactTime(c.started_at),'sf-admin-table-date');
   if(c.ended_at)started.title='Край: '+exactTime(c.ended_at);
   const worker=rowCell(tr,'Оператор',c.worker_name||'Оператор');
   worker.append(el('small','sf-admin-table-secondary',c.worker_email||'Проверен профил'));
   const company=rowCell(tr,'Клиент / фирма',c.company?.company_name||'Фирма не е посочена');
   company.append(el('small','sf-admin-table-secondary',
    [c.company?.contact_name,c.dialed_number].filter(Boolean).join(' · ')||'—'));
   rowCell(tr,'Разговор',elapsed(c.duration_seconds),'sf-admin-table-duration');
   const audio=rowCell(tr,'Аудио',c.has_audio?'🎧 Запис':'— Няма файл',
    c.has_audio?'sf-admin-table-audio-ready':'sf-admin-table-muted');
   if(c.new_audio)audio.append(el('small','sf-admin-table-secondary','● Нов запис'));
   rowCell(tr,'Резултат',statusLabels[c.outcome?.disposition]||
    (c.outcome?'Друг':'Не е записан'));
   rowCell(tr,'Статус',c.state||'—','sf-admin-table-status');
   const actionCell=rowCell(tr,'Действие','');
   const button=el('button','btn subtle sf-admin-table-open',c.has_audio?'🎧 Отвори':'👁 Детайли');
   button.type='button';
   button.setAttribute('aria-label','Отвори разговора с '+(c.company?.contact_name||c.company?.company_name||'клиента'));
   actionCell.append(button);
   button.addEventListener('click',event=>{event.stopPropagation();openDetails(c,button)});
   tr.addEventListener('click',()=>openDetails(c,button));
   tbody.append(tr);
  }
 }
 async function load(){
  if(loading||!section.isConnected)return;
  loading=true;refresh.disabled=true;
  try{
   const data=await api(endp('admin-inbox'));
   latest=Array.isArray(data.calls)?data.calls:[];
   counters.textContent='Общо: '+(data.total||0)+' · Аудио: '+(data.audio_ready||0)+
    ' · Нови аудио: '+(data.unread_audio||0)+' · Нови чатове: '+(data.unread_chat||0);
   lastFetch=Date.now();render();
  }catch(error){
   tbody.replaceChildren();table.hidden=true;empty.hidden=false;
   empty.textContent='Административната история не се зареди: '+error.message;
  }finally{loading=false;refresh.disabled=false}
 }
 search.addEventListener('input',render);
 onlyAudio.addEventListener('change',render);
 refresh.addEventListener('click',load);
 load();
 const timer=setInterval(()=>{
  if(!section.isConnected){clearInterval(timer);return}
  if(document.visibilityState!=='visible'||section.offsetParent===null||loading)return;
  // Keep the popup/player alive and seekable while an administrator listens.
  if(document.getElementById('david-call-modal')?.style.display==='flex')return;
  if(Date.now()-lastFetch>12000)load();
 },4500);
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
.sf-sales-grid[hidden],.sf-sales-outcome [hidden]{display:none!important}
.sf-sales-phone{background:#f4f8ff;border:1px solid #d7e5f8;border-radius:18px;padding:18px;min-height:280px}
.sf-sales-phone h3{font-size:22px;margin:0 0 14px}
.sf-sales-client,.sf-sales-operator{padding:11px;background:white;border:1px solid #d8e5f5;border-radius:12px;margin:8px 0;line-height:1.5}
.sf-sales-david,.sf-sales-hint{padding:15px;background:#e0f8ea;color:#14553b;border-radius:12px;line-height:1.6;font-weight:650}
.sf-sales-david{font-size:clamp(16px,2vw,22px)}
.sf-sales-timeline{max-height:280px;overflow-y:auto;margin:13px 0}
.sf-sales-line{background:white;border-radius:10px;padding:10px;margin:6px 0;line-height:1.5}
.sf-sales-line.client{background:#fff5e6}
.sf-sales-phone-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:16px auto}
.sf-sales-record-clock{font-size:13px;color:#19526b;font-weight:600;margin-top:8px}
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
.sf-admin-call-inbox{min-width:0}
.sf-admin-call-table-wrap{margin:14px 0 0;max-width:100%;overflow-x:auto;border:1px solid #dce7f4;border-radius:14px}
.sf-admin-call-table{width:100%;min-width:960px;border-collapse:collapse;font-size:13px;text-align:left;background:#fff}
.sf-admin-call-table-caption{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.sf-admin-call-table thead{background:#edf4ff}
.sf-admin-call-table th{padding:14px 12px;font-weight:750;color:#18395d;white-space:nowrap;position:sticky;top:0;z-index:1;border-bottom:1px solid #dbe6f4}
.sf-admin-call-table td{padding:15px 12px;vertical-align:middle;border-bottom:1px solid #e7edf6;color:#153454;line-height:1.45}
.sf-admin-call-table-row{cursor:pointer;transition:background .12s ease}
.sf-admin-call-table-row:hover,.sf-admin-call-table-row:focus-within{background:#f2f8ff}
.sf-admin-call-table tbody tr:last-child td{border-bottom:0}
.sf-admin-table-secondary{display:block;color:#667f99;font-size:11px;margin-top:3px;font-weight:450;overflow-wrap:anywhere}
.sf-admin-table-date{white-space:nowrap;font-variant-numeric:tabular-nums}
.sf-admin-table-duration{font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap}
.sf-admin-table-audio-ready{color:#08775e!important;font-weight:750}
.sf-admin-table-muted{color:#74869b!important}
.sf-admin-table-status{font-size:12px;font-weight:650}
.sf-admin-table-open{white-space:nowrap;font-weight:700}
.sf-admin-table-empty{padding:18px}
\n.sf-admin-private-audio{width:100%;margin-top:12px}\n.sf-admin-actual-call-clock{font-weight:700!important;color:#136a5f!important}\n.sf-admin-actual-call-duration{font-size:15px;font-weight:750;color:#144f61;margin:12px 0 5px}\n.sf-admin-playback-clock{font-variant-numeric:tabular-nums;font-size:15px;font-weight:700;color:#193d5c;margin:7px 0 5px}
.sf-admin-call-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0 4px}
.sf-admin-call-filters input[type=search]{flex:1 1 300px;min-width:180px}
.sf-admin-audio-filter{display:flex;align-items:center;gap:6px;color:#29446b;font-size:14px}
.sf-admin-audit-card{border-left:4px solid #0fa99f;padding:18px}
.sf-admin-audit-heading{display:flex;align-items:start;justify-content:space-between;gap:10px}
.sf-admin-identity{display:flex;flex-direction:column;gap:4px}
.sf-admin-call-state{border-radius:99px;background:#e7f1ff;color:#254970;font-size:12px;padding:5px 11px}
.sf-admin-company{margin:12px 0!important;font-size:18px}
.sf-admin-call-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;padding:12px;background:#f5f8ff;border:1px solid #e0e8f6;border-radius:12px}
.sf-admin-call-fact{display:flex;flex-direction:column;gap:4px;font-size:13px;overflow-wrap:anywhere}
.sf-admin-outcome-note,.sf-admin-transcript-preview{padding:10px 13px;margin-top:12px;border-radius:12px;background:#f7f9fd;white-space:pre-wrap;overflow-wrap:anywhere}
.sf-admin-outcome-note p,.sf-admin-transcript-preview p{margin:5px 0 0;font-size:13px;line-height:1.6}
.sf-admin-recording-status{margin:14px 0;padding:9px 12px;border-radius:12px;background:#eef8f6;color:#0e574a;overflow-wrap:anywhere}
.sf-admin-call-buttons{justify-content:flex-start!important}
.sf-admin-call-buttons button{flex:0 1 auto}
.sf-admin-audio-panel{margin:12px 0 14px;border:1px solid #b7d2e8;border-radius:14px;background:#f9fcff;overflow:hidden}
.sf-admin-audio-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;list-style:none;padding:13px 16px;color:#193d5c}
.sf-admin-audio-toggle::-webkit-details-marker{display:none}
.sf-admin-audio-toggle:hover{background:#e9f5ff}
.sf-admin-audio-toggle:focus-visible{outline:3px solid #246ffd;outline-offset:-3px}
.sf-admin-audio-heading{display:flex;flex-direction:column;gap:4px}
.sf-admin-audio-heading small{font-size:12px;color:#536b85}
.sf-admin-audio-chevron{font-size:23px;transition:transform .15s}
.sf-admin-audio-panel[open] .sf-admin-audio-chevron{transform:rotate(180deg)}
.sf-admin-audio-content{padding:10px 16px 17px;border-top:1px solid #dbe8f4}
.sf-admin-audio-content audio{width:100%;display:block;min-height:54px}
.sf-admin-audio-content audio[hidden]{display:none}
.sf-admin-audio-message{font-size:13px;color:#385570;line-height:1.5}
.sf-admin-audio-refresh{margin-top:9px;font-size:13px}


.sf-sales-item{padding:15px;border:1px solid #d8e4f2;border-radius:13px;background:#fff}
.sf-sales-item h3{margin:0}.sf-sales-feedback{margin-top:12px;padding:12px;border-radius:10px;background:#e5f5ff;white-space:pre-wrap;line-height:1.6}
@media(max-width:780px){.sf-sales-grid{grid-template-columns:1fr}.sf-sales-phone{padding:12px}.sf-sales-phone-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-sales-phone-actions button{max-width:none}.sf-sales-right{max-height:240px}.sf-sales-options .btn{flex:1 1 100%}}
`;
document.head.append(css);
const root=document.getElementById('root');if(root){mountLive(root);mountCompanies(root);mountAdmin(root)}
