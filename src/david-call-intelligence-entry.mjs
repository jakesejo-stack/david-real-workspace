// Enhances the ORIGINAL DAVID pages, without a replacement website or fake call data.
// Only authenticated real call sessions from Supabase appear here.
import {createClient} from '@supabase/supabase-js';
import {preparePlaybackBlob,formatAudioClock} from './david-audio-completeness.mjs';
let authClient=null,authConfig=null;
async function getToken(){
 if(!authConfig)authConfig=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
 if(!authClient)authClient=createClient(authConfig.supabaseUrl,authConfig.supabaseAnonKey);
 const {data:{session}}=await authClient.auth.getSession();
 if(!session?.access_token)throw Error('Влез с Google.');
 return session.access_token;
}
async function callApi(action,query={},opts={}){
 const token=await getToken();
 const url='/api/integrations/david/'+action+'?'+new URLSearchParams(query).toString();
 const r=await fetch(url,{...opts,cache:'no-store',headers:{Authorization:'Bearer '+token,...opts.headers}});
 const out=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(out.error||'Грешка при четене на разговора.');
 return out;
}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function formatDate(iso){if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?'—':d.toLocaleString('bg-BG',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function shortSid(s){return typeof s==='string'?s.slice(0,8)+'…'+s.slice(-4):'';}
function field(name,value){const wrap=node('div','david-ci-field');wrap.append(node('small','',name),node('strong','',value||'Не е въведено'));return wrap;}
function setMessage(parent,message){parent.replaceChildren(node('p','muted',message));}
let modal=null,playerBlob=null,closeCallback=null;
function modalShell(){
 if(modal)return modal;
 modal=node('div','david-ci-modal');
 modal.id='david-call-modal';modal.style.display='none';
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Подробности за DAVID разговора');
 const surface=node('div','david-ci-dialog');
 const top=node('div','david-ci-dialog-header');
 const title=node('div','');title.append(node('h2','','Подробности за разговор'));
 const close=node('button','btn subtle','✕ Затвори');close.type='button';close.setAttribute('aria-label','Затвори подробностите');
 close.addEventListener('click',hideModal);top.append(title,close);
 const body=node('div','david-ci-dialog-body');
 body.id='david-call-modal-body';surface.append(top,body);modal.append(surface);
 modal.addEventListener('click',event=>{if(event.target===modal)hideModal()});
 document.body.append(modal);
 return modal;
}
function hideModal(){
 if(!modal)return;
 modal.style.display='none';
 document.body.style.overflow='';
 for(const audio of modal.querySelectorAll('audio')){audio.pause();audio.removeAttribute('src');audio.load()}
 if(playerBlob){URL.revokeObjectURL(playerBlob);playerBlob=null;}
 if(closeCallback){closeCallback.focus();closeCallback=null;}
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal?.style.display==='flex')hideModal();});
document.addEventListener('david:open-call',event=>{
 const detail=event.detail||{},sid=detail.sid;
 if(typeof sid==='string'&&/^CA[0-9a-f]{32}$/i.test(sid))
  openCall(sid,detail.trigger||null,detail.overview||null,detail.autoLoadAudio===true);
});
function sectionTitle(text){return node('h3','david-ci-section-heading',text);}
async function openCall(sid,trigger,overview=null,autoLoadAudio=false){
 const shell=modalShell();closeCallback=trigger;
 const body=shell.querySelector('#david-call-modal-body');
 setMessage(body,'Зареждане на проверения разговор...');
 shell.style.display='flex';document.body.style.overflow='hidden';
 shell.querySelector('button')?.focus();
 try{
  const data=await callApi('call-detail',{sid});
  if(shell.style.display!=='flex')return;
  body.replaceChildren();
  const c=data.session?.company||{},s=data.session||{};
  const actualCallMs=s.started_at&&s.ended_at?Math.max(0,Date.parse(s.ended_at)-Date.parse(s.started_at)):null;
  shell.querySelector('.david-ci-dialog-header h2').textContent='Детайли · '+(c.company_name||c.contact_name||'Разговор');
  const summary=node('div','david-ci-grid');
  summary.append(field('Компания',c.company_name),field('Държава',c.country),field('Сектор',c.sector),
   field('Начало',formatDate(s.started_at)),field('Край',formatDate(s.ended_at)),
   field('Реален разговор',Number.isFinite(actualCallMs)?formatAudioClock(actualCallMs):'—'),
   field('Статус',s.state));
  if(overview&&data.audio_access===true){
   summary.append(field('Оператор',overview.worker_name),field('Gmail',overview.worker_email),
    field('Набран номер',overview.dialed_number));
  }
  body.append(summary);
  const company=node('section','david-ci-section');
  company.append(sectionTitle('Информация за компанията'));
  const info=node('div','david-ci-grid');
  info.append(field('Контакт',c.contact_name),field('Телефон',c.contact_phone),field('Имейл',c.contact_email),field('Задача',c.task));
  company.append(info);
  if(c.research_notes)company.append(node('p','david-ci-pre',c.research_notes));
  body.append(company);
  const sound=node('section','david-ci-section');
  let startAudioLoad=null;
  sound.append(sectionTitle('🎧 Аудиозапис на разговора'));
  if(Number.isFinite(actualCallMs))sound.append(node('p','david-ci-call-clock','⏱ Реален разговор: '+formatAudioClock(actualCallMs)));
  const browserRecording=data.browser_recording?.status==='completed'?data.browser_recording:null;
  const twilioRecord=(data.recordings||[]).find(x=>x.status==='completed');
  if(!s.recording_authorized){
   sound.append(node('p','muted','Няма съгласие за аудиозапис на този разговор.'));
  }else if(!browserRecording&&!twilioRecord){
   sound.append(node('p','muted','Няма потвърден аудиофайл за този разговор. Записът се показва след успешно качване.'));
  }else{
   const sourceName=browserRecording?'DAVID браузърен запис (оператор + клиент)':'Twilio запис';
   const info=node('p','muted',sourceName+(browserRecording?.byte_size?' · '+(browserRecording.byte_size/1048576).toFixed(2)+' MB':''));
   const playButton=node('button','btn primary','🎧 Отвори и слушай аудиото');
   playButton.type='button';
   const holder=node('div','david-ci-audio-holder');
   playButton.addEventListener('click',async()=>{
    playButton.disabled=true;
    holder.textContent='🔒 Зареждам защитеното аудио...';
    try{
     let resp;
     if(browserRecording){
      const link=await callApi('browser-record-link',{recording_id:browserRecording.id});
      if(!link?.url||!/^https:\/\//.test(link.url))throw Error('Липсва защитен линк за записа.');
      resp=await fetch(link.url,{cache:'no-store'});
     }else{
      const token=await getToken();
      resp=await fetch('/api/integrations/david/live-audio?'+new URLSearchParams({sid,recording_sid:twilioRecord.recording_sid}),{
       headers:{Authorization:'Bearer '+token},cache:'no-store'
      });
     }
     if(!resp.ok)throw Error('Не мога да заредя аудиото ('+resp.status+').');
     const blob=await resp.blob();
     if(shell.style.display!=='flex'||!holder.isConnected)return;
     if(blob.size<1024||blob.size>26214400)throw Error('Невалиден или прекалено голям аудиофайл.');
     const prepared=await preparePlaybackBlob(blob);
     if(playerBlob)URL.revokeObjectURL(playerBlob);
     playerBlob=URL.createObjectURL(prepared.blob);
     const audio=node('audio','david-ci-player');audio.controls=true;audio.preload='auto';audio.src=playerBlob;
     audio.setAttribute('aria-label','Целият съхранен запис на разговора с '+(c.company_name||'клиента'));
     let heardMs=prepared.durationMs||Number(browserRecording?.record_duration_ms)||null;
     const duration=node('p','muted',heardMs?'Дължина на съхраненото аудио: '+formatAudioClock(heardMs):
      'Целият наличен аудиофайл е зареден. Времетраенето се проверява от браузъра.');
     const playbackClock=node('p','david-ci-playback-clock','🎧 Аудио: 00:00 / '+(heardMs?formatAudioClock(heardMs):'--:--'));
     const updateAudioTime=()=>{
      const played=Number.isFinite(audio.currentTime)&&audio.currentTime>=0?formatAudioClock(audio.currentTime*1000):'00:00';
      const audioMs=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration*1000:heardMs;
      playbackClock.textContent='🎧 Аудио: '+played+' / '+(audioMs?formatAudioClock(audioMs):'--:--');
     };
     audio.addEventListener('loadedmetadata',()=>{
      if(Number.isFinite(audio.duration)&&audio.duration>0){
       heardMs=audio.duration*1000;
       duration.textContent='Дължина на съхраненото аудио: '+formatAudioClock(heardMs);
       if(Number.isFinite(actualCallMs)&&heardMs+8000<actualCallMs)duration.textContent+=' · Записът започва след съгласие или е прекъснат преди края.';
      }
      updateAudioTime();
     });
     for(const name of ['timeupdate','seeked','durationchange','ended'])audio.addEventListener(name,updateAudioTime);
     if(heardMs&&Number.isFinite(actualCallMs)&&heardMs+8000<actualCallMs)duration.textContent+=' · Записът започва след съгласие или е прекъснат преди края.';
     holder.replaceChildren(audio,playbackClock,duration,node('p','muted','▶ Play / Pause / превъртане на целия съхранен файл.'));
     playButton.textContent='↻ Зареди отново аудиото';
     callApi('admin-mark-read',{}, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({call_sid:sid,kind:'audio'})}).catch(()=>{});
    }catch(error){holder.textContent='Грешка при зареждане: '+error.message}
    finally{playButton.disabled=false}
   });
   sound.append(info,playButton,holder);
   startAudioLoad=()=>playButton.click();
  }
  if(data.audio_access===true){
   body.append(sound);
   // Load the protected audio into the popup after a row click, but never autoplay it.
   if(autoLoadAudio&&startAudioLoad)startAudioLoad();
  }
  const transcript=node('section','david-ci-section');transcript.append(sectionTitle('Пълен разговор и DAVID подсказки'));
  const suggestions=new Map((data.suggestions||[]).map(x=>[x.transcript_segment_id,x]));
  const segments=data.transcript||[];
  if(!segments.length)transcript.append(node('p','muted','Няма транскрипция. DAVID никога не измисля записи от обаждания.'));
  for(const line of segments){
   const item=node('article','david-ci-line '+(line.speaker==='client'?'david-ci-client':''));
   const label=line.speaker==='client'?'Клиент':'Оператор';
   item.append(node('small','',formatDate(line.source_at||line.created_at)+' · '+label));
   item.append(node('p','',line.content));
   transcript.append(item);
   const ai=suggestions.get(line.id);
   if(ai){const card=node('article','david-ci-answer');card.append(node('strong','','DAVID: '),document.createTextNode(ai.suggestion));transcript.append(card);}
  }
  body.append(transcript);
  if(data.outcome){const outcome=node('section','david-ci-section');outcome.append(sectionTitle('Резултат и бележка'));outcome.append(node('p','',({no_answer:'Не вдигнаха',neutral:'Неутрално',early_access:'Ранно записване'})[data.outcome.disposition]||data.outcome.disposition));outcome.append(node('p','david-ci-pre',data.outcome.notes||'Няма бележка.'));body.append(outcome);}
  if(data.audio_access===true)callApi('admin-mark-read',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({call_sid:sid,kind:'chat'})}).catch(()=>{});
 }catch(error){setMessage(body,'Неуспешно зареждане: '+error.message)}
}
function mountCallRecords(root){
 const heading=[...root.querySelectorAll('.main h1,.main h2')].find(h=>h.textContent?.trim()==='Call Records');
 if(!heading)return;
 const host=heading.closest('.main');if(!host||host.querySelector('#david-call-records-extra'))return;
 const panel=node('section','card david-ci-list');panel.id='david-call-records-extra';
 const hdr=node('div','david-ci-list-header');hdr.append(node('h2','','DAVID · История на разговорите'));
 const refresh=node('button','btn subtle','↻ Обнови');refresh.type='button';hdr.append(refresh);panel.append(hdr);
 panel.append(node('p','muted','Преглед на историята на обажданията. Подробностите и аудиозаписите се отварят само през Admin Panel от администратори.'));
 const wrap=node('div','david-ci-table-wrap');wrap.setAttribute('role','region');
 wrap.setAttribute('aria-label','Таблица с разговори');wrap.tabIndex=0;
 const table=node('table','david-ci-table');const thead=node('thead'),headers=node('tr');
 for(const label of ['Дата и час','Фирма / клиент','Продължителност','Статус']){
  const th=node('th','',label);th.scope='col';headers.append(th);
 }
 thead.append(headers);const tbody=node('tbody');table.append(thead,tbody);wrap.append(table);panel.append(wrap);
 const empty=node('p','muted','Зареждане на реалните записи...');panel.append(empty);
 heading.insertAdjacentElement('afterend',panel);
 let fetching=false;
  const load=async()=>{
  if(fetching)return;fetching=true;refresh.disabled=true;
  try{
   const data=await callApi('call-records');
   tbody.replaceChildren();
   const calls=Array.isArray(data.calls)?data.calls:[];
   table.hidden=!calls.length;empty.hidden=!!calls.length;
   if(!calls.length){empty.textContent='Още няма реални разговори в DAVID Call Records.';return;}
   for(const s of calls){
    const tr=node('tr','david-ci-table-row');
    tr.append(node('td','',formatDate(s.started_at)));
    const company=node('td','',s.company?.company_name||'Фирма не е свързана');
    if(s.company?.contact_name)company.append(node('small','david-ci-table-secondary',s.company.contact_name));
    tr.append(company);
    const ms=s.started_at&&s.ended_at?Math.max(0,Date.parse(s.ended_at)-Date.parse(s.started_at)):null;
    tr.append(node('td','',Number.isFinite(ms)?formatAudioClock(ms):'—'));
    tr.append(node('td','',s.state||'—'));
    // Read-only operator history. No details popup and no recording access here.
    tbody.append(tr);
   }
  }catch(error){tbody.replaceChildren();table.hidden=true;empty.hidden=false;empty.textContent='Записите не могат да се заредят: '+error.message}
  finally{fetching=false;refresh.disabled=false;}
 };
 refresh.addEventListener('click',load);load();
}
function mountDesk(root){
 const heading=[...root.querySelectorAll('.main h1,.main h2')].find(h=>/^(Live Call Desk|Live Desk)$/.test(h.textContent?.trim()||''));
 if(!heading)return;
 const host=heading.closest('.main');if(!host||host.querySelector('#david-call-coach-live'))return;
 const panel=node('section','card david-ci-live');panel.id='david-call-coach-live';
 panel.append(node('h2','','✦ DAVID · Live Operator Coach'));
 panel.append(node('p','muted','DAVID показва надписи от разрешен разговор и предлага текстови отговори. Аудиозаписът се управлява отделно.'));
 const meta=node('p','muted','Проверка на активния разговор...');
 const customer=node('div','david-ci-utterance','Клиент: —');
 const operator=node('div','david-ci-utterance david-ci-operator','Оператор: —');
 const captionHead=node('div','david-ci-captions-head');
 captionHead.append(node('h3','','Live Captions · Двата гласа'));
 const captionState=node('span','tag gray','● Чака разрешение');
 captionHead.append(captionState);
 const captions=node('div','david-ci-captions');
 captions.setAttribute('role','log');captions.setAttribute('aria-label','Живи надписи от разговора');
 captions.setAttribute('aria-live','polite');captions.setAttribute('aria-relevant','additions');
 captions.append(node('p','muted','Надписите ще се появят след реално Twilio обаждане и разрешено транскрибиране.'));
 const answer=node('div','david-ci-answer','DAVID: Очаквам потвърден разговор и първа реплика от клиента.');
 const adviceLabel=node('p','tiny','✦ DAVID подсказва само на оператора. AI не говори по телефона.');
 const permissions=node('div','david-ci-permissions');
 const notice=node('p','muted','Live Captions: първо информирай събеседника за транскрипцията и AI подсказките. Използвай само при проверено правно основание за това обработване. Натискането на бутона потвърждава, че си изпълнил тези условия. Аудиозаписът изисква отделно изрично разрешение.');
 const language=node('select','field');language.setAttribute('aria-label','Език на клиента');
 for(const [code,label] of [['bg-BG','Български'],['en-US','English'],['es-ES','Español'],['de-DE','Deutsch'],['fr-FR','Français']]){
  const opt=node('option','',label);opt.value=code;language.append(opt);
 }
 const listen=node('button','btn primary','▶ Live Captions');listen.disabled=true;
 const record=node('button','btn subtle','● Запис (след разрешение)');record.disabled=true;
 listen.type='button';record.type='button';
 const actions=node('div','david-ci-consent-actions');actions.append(language,listen,record);
 const stopTrans=node('button','btn red','Спри транскрипцията');
 const stopRecording=node('button','btn red','Спри аудиозаписа');
 stopTrans.type='button';stopRecording.type='button';stopTrans.hidden=true;stopRecording.hidden=true;
 actions.append(stopTrans,stopRecording);
 const result=node('p','muted','');
 permissions.append(notice,actions,result);
 panel.append(meta,customer,operator,captionHead,captions,answer,adviceLabel,permissions);
 heading.insertAdjacentElement('afterend',panel);
 let busy=false, timer=null,callSid=null,lastCaptionSignature='';
 const renderCaptions=(lines,enabled)=>{
  if(!enabled){
   if(lastCaptionSignature!=='disabled'){
    lastCaptionSignature='disabled';captions.replaceChildren(node('p','muted','Няма разрешена транскрипция. Live Captions са изключени.'));
   }
   return;
  }
  const current=(lines||[]).slice(-24);
  const signature=JSON.stringify(current.map(x=>[x.id,x.speaker,x.content,x.david_hint]));
  if(signature===lastCaptionSignature)return;
  lastCaptionSignature=signature;
  const follow=captions.scrollTop+captions.clientHeight>=captions.scrollHeight-65;
  captions.replaceChildren();
  if(!current.length)captions.append(node('p','muted','Слушам разрешения разговор. Изчаквам първата завършена реплика...'));
  for(const line of current){
   const isClient=line.speaker==='client';
   const entry=node('div','david-ci-caption-line '+(isClient?'client':'operator'));
   const head=node('strong','',isClient?'Клиент':'Оператор');
   entry.append(head,node('p','',String(line.content||'')));
   if(line.david_hint){
    const hint=node('div','david-ci-caption-advice');
    hint.append(node('strong','','✦ DAVID предлага:'),node('p','',String(line.david_hint)));
    entry.append(hint);
   }
   captions.append(entry);
  }
  if(follow||current.length<3)captions.scrollTop=captions.scrollHeight;
 };

 const startMedia=async scope=>{
  if(!callSid)return;
  // Captions: one-click operator attestation of prior notice and assessed legal basis.
  // Audio recording: separate explicit agreement from the other party is mandatory.
  if(scope==='recording'&&!window.confirm('Клиентът изрично разреши ли аудиозаписването?'))return;
  const button=scope==='recording'?record:listen;
  button.disabled=true;result.textContent=scope==='recording'?'Проверявам разрешението за аудиозапис...':'Стартирам Live Captions чрез Twilio...';
  const attestation=scope==='transcription'?{noticeDelivered:true,lawfulBasisConfirmed:true}:{clientConfirmed:true};
  try{
   const out=await callApi('live-consent',{},{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({call_sid:callSid,scope,...attestation,noticeVersion:'david-v1',method:'verbal',language_code:language.value})
   });
   result.textContent=out.started?'✓ '+(scope==='recording'?'Аудиозаписът':'Live Captions')+' е стартиран.':'Twilio не потвърди стартиране.';
  }catch(error){result.textContent='Не е активирано: '+error.message;}
  finally{button.disabled=false;update();}
 };
 listen.addEventListener('click',()=>startMedia('transcription'));
 record.addEventListener('click',()=>startMedia('recording'));
 const stop=async scope=>{
  if(!callSid||!window.confirm('Спиране на '+(scope==='recording'?'аудиозаписа':'транскрипцията')+' за този разговор?'))return;
  const button=scope==='recording'?stopRecording:stopTrans;
  button.disabled=true;result.textContent='Спиране на обработката...';
  try{
   const out=await callApi('live-stop',{},{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({call_sid:callSid,scope})
   });
   result.textContent=out.stopped?'✓ Обработката е спряна.':'Няма потвърждение за спиране.';
  }catch(error){result.textContent='Неуспешно спиране: '+error.message}
  finally{button.disabled=false;update()}
 };
 stopTrans.addEventListener('click',()=>stop('transcription'));
 stopRecording.addEventListener('click',()=>stop('recording'));
 const update=async()=>{
  if(busy||!panel.isConnected)return;busy=true;
  try{
   const data=await callApi('live-status');
   if(!data.active){
    callSid=null;listen.disabled=true;record.disabled=true;stopTrans.hidden=true;stopRecording.hidden=true;
    meta.textContent='Няма активно Twilio обаждане. Надписите не могат да започнат преди реален разговор.';
    customer.textContent='Клиент: —';operator.textContent='Оператор: —';
    answer.textContent='DAVID: Изчаквам да започне разговорът.';
    captionState.textContent='● Изчаква обаждане';captionState.className='tag gray';
    renderCaptions([],false);
    return;
   }
   callSid=data.call_sid;
   listen.disabled=data.state!=='in-progress'||!!data.transcription_active||!!data.transcription_stopped||data.transcription_feature_enabled===false;record.disabled=data.state!=='in-progress'||!!data.recording_authorized||data.recording_feature_enabled===false;
   stopTrans.hidden=!data.transcription_active;stopRecording.hidden=!data.recording_active;
   meta.textContent=(data.company?.company_name||'Без свързана фирма')+' · '+data.state+' · '+shortSid(data.call_sid)+(data.transcription_authorized?' · Live Captions разрешени':' · Live Captions не са стартирани');
   const active=!!data.transcription_active;
   const transcriptRows=data.transcript||[];
   const lastSegment=transcriptRows.at(-1);
   const secondsWaiting=Date.now()-Date.parse(lastSegment?.created_at||data.transcription_started_at||Date.now());
   captionState.textContent=active?(transcriptRows.length?'● LIVE CAPTIONS':secondsWaiting>12000?'⚠ Няма реч от Twilio':'● Twilio слуша'):data.transcription_stopped?'○ Транскрипцията е спряна':data.transcription_authorized?'○ Очаква се STT':'● Изчаква стартиране';
   captionState.className='tag '+(active?'green':'gray');
   customer.textContent='Клиент: '+(active&&data.latest_customer_line||'Очаквам клиентска реплика');
   operator.textContent='Оператор: '+(active&&data.latest_operator_line||'Очаквам речта на оператора');
   if(active&&!transcriptRows.length&&secondsWaiting>12000){
    if(lastCaptionSignature!=='missing_stt'){
     captions.replaceChildren(node('p','muted','Twilio е стартирал транскрипция, но още не е изпратил завършена реплика. Проверете езика и състоянието на Twilio.'));
     lastCaptionSignature='missing_stt';
    }
   }else{
    renderCaptions(data.transcript,active);
   }
   const lastClient=active?(data.transcript||[]).filter(x=>x.speaker==='client').at(-1):null;
   const latestHint=lastClient?.david_hint;
   answer.textContent='DAVID: '+(!active?'Информирай събеседника и при валидно правно основание натисни ▶ Live Captions, за да получаваш AI подсказки.':latestHint||(
    lastClient?(data.coach_feature_enabled===false?'AI подсказките още не са активирани.':
     Date.now()-Date.parse(lastClient.created_at||0)>10000?'Няма получена подсказка за тази реплика. Продължи разговора самостоятелно.':'Обработвам последната клиентска реплика...'):'Изчаквам клиента. Ще предложа какво да кажеш след неговата реплика.'
   ));
   if(data.transcription_feature_enabled===false&&!data.transcription_authorized)result.textContent='Live Captions са подготвени, но още не са активирани от администратора.';
  }catch(error){meta.textContent='Live Coach: '+error.message}
  finally{busy=false;}
 };
 update();
 timer=setInterval(()=>{if(document.visibilityState==='visible'&&panel.isConnected&&panel.offsetParent!==null)update();if(!panel.isConnected)clearInterval(timer);},1500);
}
let scheduled=false;
const observer=new MutationObserver(()=>{
 if(scheduled)return;
 scheduled=true;queueMicrotask(()=>{scheduled=false;const root=document.getElementById('root');if(root){mountCallRecords(root);mountDesk(root);}});
});
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
const css=document.createElement('style');
css.textContent=`
.david-ci-list-header,.david-ci-record{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.david-ci-table-wrap{max-width:100%;overflow-x:auto;border:1px solid #dbe7f5;border-radius:12px;margin-top:14px}
.david-ci-table{width:100%;min-width:650px;border-collapse:collapse;background:#fff;font-size:13px}
.david-ci-table th,.david-ci-table td{text-align:left;padding:13px 14px;border-bottom:1px solid #e5edf7}
.david-ci-table th{background:#eef5ff;font-weight:750;color:#173b60;white-space:nowrap}
.david-ci-table-row{cursor:default}
.david-ci-table tr:last-child td{border-bottom:0}
.david-ci-table-secondary{display:block;color:#617b94;font-size:11px;margin-top:4px}
.david-ci-record p{margin:4px 0 0}.david-ci-list-header h2{margin:0}.david-ci-live{margin:16px 0}
.david-ci-consent-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}
.david-ci-consent-actions select{width:auto;flex:0 1 180px}
.david-ci-permissions[hidden]{display:none!important}
.david-ci-utterance{padding:12px;border-radius:12px;background:#eaf3ff;margin:9px 0}
.david-ci-operator{background:#f2f5fa}
.david-ci-captions-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:18px 0 8px}
.david-ci-captions-head h3{margin:0}
.david-ci-captions{height:260px;overflow-y:auto;overscroll-behavior:contain;background:#f7f9fc;border:1px solid #dbe5f2;border-radius:14px;padding:12px}
.david-ci-caption-line{padding:10px 12px;background:#fff;border:1px solid #dbe5f2;border-radius:11px;margin:7px 0;overflow-wrap:anywhere}
.david-ci-caption-line.client{border-left:4px solid #e6a44e}
.david-ci-caption-line.operator{border-left:4px solid #307dd9}
.david-ci-caption-line strong{font-size:12px;color:#345b79}
.david-ci-caption-line p{margin:4px 0 0;white-space:pre-wrap}
.david-ci-caption-advice{background:#e4f9ee;border-radius:9px;padding:10px;margin-top:8px;color:#086347}
.david-ci-caption-advice strong{color:#08764e}
.david-ci-answer{padding:14px;border-radius:12px;background:#dff8ed;color:#0a533b;line-height:1.6;font-size:15px;margin:10px 0}
.david-ci-modal{position:fixed;inset:0;background:#0b1d37a8;z-index:1100;display:flex;align-items:center;justify-content:center;padding:18px}
.david-ci-dialog{display:flex;flex-direction:column;background:#f7faff;width:min(100%,980px);height:min(92vh,980px);border-radius:18px;box-shadow:0 20px 70px #0b1d3760;overflow:hidden}
.david-ci-dialog-header{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;background:white;border-bottom:1px solid #dae6f7;gap:12px;flex:none}
.david-ci-dialog-header h2{margin:0}.david-ci-dialog-body{padding:18px 22px 50px;overflow-y:auto;overscroll-behavior:contain;flex:1}
.david-ci-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.david-ci-field{padding:10px;background:#fff;border:1px solid #d9e4f4;border-radius:10px;overflow-wrap:anywhere}
.david-ci-field small{display:block;color:#587091}.david-ci-section{margin:22px 0;padding:14px;background:white;border:1px solid #e0e8f5;border-radius:12px}
.david-ci-section-heading{font-size:16px;margin-bottom:14px}.david-ci-pre{white-space:pre-wrap;margin-top:10px}
.david-ci-line{padding:12px;background:#f0f5ff;border-radius:10px;margin:9px 0}
.david-ci-line small{color:#516582}.david-ci-line p{margin:6px 0 0;white-space:pre-wrap}
.david-ci-client{background:#fff5e8}
.david-ci-call-clock{font-size:15px;font-weight:750;color:#144f61;margin:9px 0}
.david-ci-playback-clock{font-size:15px;font-weight:700;color:#193d5c;font-variant-numeric:tabular-nums;margin:8px 0}
.david-ci-audio-holder{margin-top:12px}
.david-ci-player{width:100%;display:block;margin:12px 0}
@media(max-width:690px){.david-ci-modal{padding:0}.david-ci-dialog{width:100%;height:100dvh;max-height:none;border-radius:0}.david-ci-dialog-header{padding:12px}.david-ci-dialog-body{padding:12px 12px 90px}.david-ci-grid{grid-template-columns:1fr}.david-ci-record button{width:100%}}
`;
document.head.append(css);
const root=document.getElementById('root');if(root){mountCallRecords(root);mountDesk(root);}
