// Enhances the ORIGINAL DAVID pages, without a replacement website or fake call data.
// Only authenticated real call sessions from Supabase appear here.
import {createClient} from '@supabase/supabase-js';
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
function formatDate(iso){if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?'—':d.toLocaleString('bg-BG',{dateStyle:'medium',timeStyle:'medium'});}
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
 if(playerBlob){URL.revokeObjectURL(playerBlob);playerBlob=null;}
 if(closeCallback){closeCallback.focus();closeCallback=null;}
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal?.style.display==='flex')hideModal();});
function sectionTitle(text){return node('h3','david-ci-section-heading',text);}
async function openCall(sid,trigger){
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
  const summary=node('div','david-ci-grid');
  summary.append(field('Компания',c.company_name),field('Държава',c.country),field('Сектор',c.sector),
   field('Начало',formatDate(s.started_at)),field('Край',formatDate(s.ended_at)),field('Статус',s.state));
  body.append(summary);
  const company=node('section','david-ci-section');
  company.append(sectionTitle('Информация за компанията'));
  const info=node('div','david-ci-grid');
  info.append(field('Контакт',c.contact_name),field('Телефон',c.contact_phone),field('Имейл',c.contact_email),field('Задача',c.task));
  company.append(info);
  if(c.research_notes)company.append(node('p','david-ci-pre',c.research_notes));
  body.append(company);
  const sound=node('section','david-ci-section');sound.append(sectionTitle('Аудиозапис от Twilio'));
  const records=(data.recordings||[]).filter(x=>x.status==='completed');
  if(!s.recording_authorized)sound.append(node('p','muted','Няма разрешено записване за този разговор.'));
  else if(records.length===0)sound.append(node('p','muted','Няма наличен завършен аудиозапис.'));
  else{
   const playButton=node('button','btn primary','▶ Зареди защитения аудиозапис');
   const holder=node('div','');playButton.addEventListener('click',async()=>{
    playButton.disabled=true;holder.textContent='Зареждане на аудиото...';
    try{
     const token=await getToken();
     const resp=await fetch('/api/integrations/david/live-audio?'+new URLSearchParams({sid,recording_sid:records[0].recording_sid}),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
     if(!resp.ok){const err=await resp.json().catch(()=>({}));throw Error(err.error||'Аудиото не е достъпно');}
     const blob=await resp.blob();if(playerBlob)URL.revokeObjectURL(playerBlob);
     playerBlob=URL.createObjectURL(blob);const audio=node('audio','');audio.controls=true;audio.preload='none';audio.src=playerBlob;audio.style.width='100%';holder.replaceChildren(audio);
    }catch(error){holder.textContent=error.message}finally{playButton.disabled=false}
   });
   sound.append(playButton,holder);
  }
  body.append(sound);
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
 }catch(error){setMessage(body,'Неуспешно зареждане: '+error.message)}
}
function mountCallRecords(root){
 const heading=[...root.querySelectorAll('.main h1,.main h2')].find(h=>h.textContent?.trim()==='Call Records');
 if(!heading)return;
 const host=heading.closest('.main');if(!host||host.querySelector('#david-call-records-extra'))return;
 const panel=node('section','card david-ci-list');panel.id='david-call-records-extra';
 const hdr=node('div','david-ci-list-header');hdr.append(node('h2','','DAVID · Детайлна история'));
 const refresh=node('button','btn subtle','↻ Обнови');refresh.type='button';hdr.append(refresh);panel.append(hdr);
 panel.append(node('p','muted','Реални разговори с фирма, време, транскрипция, аудио и подсказки от DAVID. Записът се показва само ако е разрешен.'));
 const list=node('div','david-ci-items');panel.append(list);
 heading.insertAdjacentElement('afterend',panel);
 let fetching=false;
 const load=async()=>{
  if(fetching)return;fetching=true;refresh.disabled=true;setMessage(list,'Зареждане на реалните записи...');
  try{
   const data=await callApi('call-records');
   list.replaceChildren();
   if(!data.calls?.length){setMessage(list,'Още няма реални разговори в DAVID Call Records.');return;}
   for(const s of data.calls){
    const row=node('div','david-ci-record');
    const left=node('div','');left.append(node('strong','',s.company?.company_name||'Фирма не е свързана'),node('p','muted',formatDate(s.started_at)+' · '+s.state+' · '+shortSid(s.call_sid)));
    const button=node('button','btn primary','Разгърни');button.type='button';button.addEventListener('click',()=>openCall(s.call_sid,button));
    row.append(left,button);list.append(row);
   }
  }catch(error){setMessage(list,'Записите не могат да се заредят: '+error.message)}
  finally{fetching=false;refresh.disabled=false;}
 };
 refresh.addEventListener('click',load);
 load();
}
function mountDesk(root){
 const heading=[...root.querySelectorAll('.main h1,.main h2')].find(h=>/^(Live Call Desk|Live Desk)$/.test(h.textContent?.trim()||''));
 if(!heading)return;
 const host=heading.closest('.main');if(!host||host.querySelector('#david-call-coach-live'))return;
 const panel=node('section','card david-ci-live');panel.id='david-call-coach-live';
 panel.append(node('h2','','✦ DAVID · Live Operator Coach'));
 panel.append(node('p','muted','DAVID слуша само след разрешено транскрибиране. Операторът чете подсказката и решава дали да я използва.'));
 const meta=node('p','muted','Проверка на активния разговор...');
 const customer=node('div','david-ci-utterance','Клиент: —');
 const answer=node('div','david-ci-answer','DAVID: Очаквам потвърден разговор и първа реплика от клиента.');
 const permissions=node('div','david-ci-permissions');permissions.hidden=true;
 const notice=node('p','muted','Преди активиране уведомете клиента, че речта се изпраща за разпознаване и AI анализ, и потвърдете разрешението му. Аудиозаписът се разрешава отделно.');
 const language=node('select','field');language.setAttribute('aria-label','Език на клиента');
 for(const [code,label] of [['bg-BG','Български'],['en-US','English'],['es-ES','Español'],['de-DE','Deutsch'],['fr-FR','Français']]){
  const opt=node('option','',label);opt.value=code;language.append(opt);
 }
 const listen=node('button','btn primary','Потвърди съгласие за транскрипция');
 const record=node('button','btn subtle','Потвърди съгласие за аудиозапис');
 listen.type='button';record.type='button';
 const actions=node('div','david-ci-consent-actions');actions.append(language,listen,record);
 const result=node('p','muted','');
 permissions.append(notice,actions,result);
 panel.append(meta,customer,answer,permissions);
 heading.insertAdjacentElement('afterend',panel);
 let busy=false, timer=null,callSid=null;
 const consent=async scope=>{
  if(!callSid)return;
  if(!window.confirm(scope==='recording'?'Клиентът изрично разреши ли аудиозаписването?':'Клиентът изрично разреши ли речта да се транскрибира и анализира от AI?'))return;
  const button=scope==='recording'?record:listen;
  button.disabled=true;result.textContent='Проверявам Twilio и правното потвърждение...';
  try{
   const out=await callApi('live-consent',{},{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({call_sid:callSid,scope,clientConfirmed:true,noticeVersion:'david-v1',method:'verbal',language_code:language.value})
   });
   result.textContent=out.started?'✓ Twilio '+(scope==='recording'?'аудиозапис':'транскрипция')+' е стартиран.':'Съгласието е отчетено, но обработката още не е стартирана.';
  }catch(error){result.textContent='Не е активирано: '+error.message;}
  finally{button.disabled=false;update();}
 };
 listen.addEventListener('click',()=>consent('transcription'));
 record.addEventListener('click',()=>consent('recording'));
 const update=async()=>{
  if(busy||!panel.isConnected)return;busy=true;
  try{
   const data=await callApi('live-status');
   if(!data.active){callSid=null;permissions.hidden=true;meta.textContent='Няма активен разрешен Twilio разговор.';customer.textContent='Клиент: —';answer.textContent='DAVID: Очаквам разговор.';return;}
   callSid=data.call_sid;permissions.hidden=false;
   listen.disabled=!!data.transcription_authorized;record.disabled=!!data.recording_authorized;
   meta.textContent=(data.company?.company_name||'Без свързана фирма')+' · '+data.state+' · '+shortSid(data.call_sid)+(data.transcription_authorized?' · Транскрипция разрешена':' · Транскрипция не е разрешена');
   customer.textContent='Клиент: '+(data.latest_customer_line||'Очаквам клиентска реплика');
   answer.textContent='DAVID: '+(data.suggestion||'Очаквам клиентската реплика, след която ще предложа точен отговор за оператора.');
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
.david-ci-items{display:grid;gap:10px;margin-top:14px}.david-ci-record{border:1px solid #dbe7f5;border-radius:12px;padding:14px}
.david-ci-record p{margin:4px 0 0}.david-ci-list-header h2{margin:0}.david-ci-live{margin:16px 0}
.david-ci-consent-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}
.david-ci-consent-actions select{width:auto;flex:0 1 180px}
.david-ci-permissions[hidden]{display:none!important}
.david-ci-utterance{padding:14px;border-radius:12px;background:#eaf3ff;margin:12px 0}
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
@media(max-width:690px){.david-ci-modal{padding:0}.david-ci-dialog{width:100%;height:100dvh;max-height:none;border-radius:0}.david-ci-dialog-header{padding:12px}.david-ci-dialog-body{padding:12px 12px 90px}.david-ci-grid{grid-template-columns:1fr}.david-ci-record button{width:100%}}
`;
document.head.append(css);
const root=document.getElementById('root');if(root){mountCallRecords(root);mountDesk(root);}
