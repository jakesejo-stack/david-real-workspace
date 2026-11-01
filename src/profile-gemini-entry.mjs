import {createClient} from '@supabase/supabase-js';

// UI-only save acknowledgement. Personal data and Gemini keys stay in Supabase.
// Supabase's session_id is stable across token refresh and changes after a new login.
const PROFILE_MARKER_PREFIX='david:profile-confirmed:';
const confirmedThisTab=new Set();
let client=null,configured=null;
async function authClient(){
 if(!configured)configured=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
 if(!configured.supabaseUrl||!configured.supabaseAnonKey)throw Error('No auth configuration');
 if(!client){
  client=createClient(configured.supabaseUrl,configured.supabaseAnonKey);
  client.auth.onAuthStateChange(event=>{
   if(event!=='SIGNED_OUT')return;
   confirmedThisTab.clear();
   try{
    for(let i=sessionStorage.length-1;i>=0;i--){
     const key=sessionStorage.key(i);
     if(key?.startsWith(PROFILE_MARKER_PREFIX))sessionStorage.removeItem(key);
    }
   }catch{}
  });
 }
 return client;
}
async function session(){
 const auth=await authClient();
 const {data:{session:s}}=await auth.auth.getSession();
 if(!s?.access_token||!s.user?.id)throw Error('Влез с Google, за да редактираш профила.');
 return s;
}
async function request(method,path,body){
 const token=(await session()).access_token;
 const response=await fetch(path,{
  method,cache:'no-store',
  headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Неуспешна заявка');
 return result;
}
function markerFor(s){
 if(!s?.user?.id)return null;
 let id='';
 try{
  const part=s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  id=JSON.parse(atob(part)).session_id||'';
 }catch{}
 // Fallback keeps old Supabase sessions usable without treating every login
 // by the same Gmail as the same session.
 if(!id)id=s.user.last_sign_in_at||'';
 return id?PROFILE_MARKER_PREFIX+s.user.id+':'+id:null;
}
function isConfirmed(s){
 const key=markerFor(s);
 if(!key)return false;
 if(confirmedThisTab.has(key))return true;
 try{return sessionStorage.getItem(key)==='yes'}catch{return false}
}
function confirmSession(s){
 const key=markerFor(s);
 if(!key)return;
 confirmedThisTab.add(key);
 try{sessionStorage.setItem(key,'yes')}catch{}
}
function validSavedProfile(p){
 return !!(p&&String(p.full_name||'').trim()&&String(p.city||'').trim()&&String(p.phone||'').trim());
}
function mountProfile(panel){
 const section=document.createElement('section');
 section.className='card';
 section.innerHTML='<h2>Моят профил в SoulFlame</h2><p class="muted">Данните са свързани с потвърдения ти Google акаунт.</p><p id="david-profile-loading" class="muted" role="status">Проверявам профила...</p><div id="david-profile-confirmed" hidden role="status" aria-live="polite" style="margin:14px 0;color:#087c4d"><strong>✓ Профилът е запазен успешно</strong><p class="tiny" style="margin:6px 0 0">Данните са потвърдени за тази сесия. При следващ вход можеш отново да ги редактираш.</p></div><form class="stack" id="david-personal-profile" hidden><label>Имена<input name="full_name" class="field" maxlength="120" required autocomplete="name"></label><label>Град<input name="city" class="field" maxlength="100" required autocomplete="address-level2"></label><label>Телефонен номер<input name="phone" class="field" maxlength="40" required autocomplete="tel"></label><label>Потвърден Gmail<input name="gmail" class="field" type="email" readonly></label><button class="btn primary" type="submit">Запази профила</button></form><p role="status" aria-live="polite" id="david-profile-status"></p><div style="margin-top:18px;border-top:1px solid #e0e9f5;padding-top:15px"><strong>Gemini · Soulflame AI</strong><p id="david-profile-gemini-status" class="muted" role="status" aria-live="polite">Проверка на връзката...</p><div id="david-profile-gemini-setup" hidden><p class="tiny">Свържи личния си Gemini ключ веднъж. Ключът се криптира на сървъра и не се показва повторно.</p><p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">🔑 Генерирай Gemini API ключ</a></p><form id="david-profile-gemini-form" class="stack"><label>Gemini API ключ<input type="password" name="key" class="field" autocomplete="off" spellcheck="false" placeholder="Постави API ключа"></label><button type="submit" class="btn primary">Свържи Gemini</button></form></div></div>';
 panel.replaceChildren(section);
 const loading=section.querySelector('#david-profile-loading');
 const form=section.querySelector('#david-personal-profile');
 const confirmed=section.querySelector('#david-profile-confirmed');
 const status=section.querySelector('#david-profile-status');
 const geminiStatus=section.querySelector('#david-profile-gemini-status');
 const geminiSetup=section.querySelector('#david-profile-gemini-setup');
 const geminiForm=section.querySelector('#david-profile-gemini-form');
 const set=(name,value)=>{form.elements.namedItem(name).value=value||''};
 const showForm=visible=>{form.hidden=!visible;form.style.display=visible?'grid':'none';};
 const showConfirmed=visible=>{confirmed.hidden=!visible;confirmed.style.display=visible?'block':'none';};
 function showError(error){status.textContent=error.message||String(error);status.style.color='#b42318'}
 function geminiConnected(connected){
  geminiStatus.textContent=connected?'✓ Gemini свързан с твоя Google профил':'Gemini още не е свързан.';
  geminiStatus.style.color=connected?'#087c4d':'#986009';
  geminiSetup.hidden=connected;
  geminiSetup.style.display=connected?'none':'block';
  if(connected)geminiForm.elements.namedItem('key').value='';
 }
 Promise.all([session(),request('GET','/api/gemini-key?mode=profile')]).then(([s,data])=>{
  if(!panel.isConnected)return;
  const p=data.profile||{};
  for(const k of ['full_name','city','phone'])set(k,p[k]);
  set('gmail',data.verifiedEmail);
  const saved=isConfirmed(s)&&validSavedProfile(p);
  showForm(!saved);
  showConfirmed(saved);
  loading.hidden=true;
  loading.style.display='none';
 }).catch(error=>{
  if(!panel.isConnected)return;
  loading.hidden=true;loading.style.display='none';
  showForm(true);
  showError(error);
 });
 request('GET','/api/gemini-key').then(data=>{
  if(panel.isConnected)geminiConnected(data.connected===true);
 }).catch(error=>{
  if(!panel.isConnected)return;
  geminiStatus.textContent='Не може да се провери Gemini: '+error.message;
  geminiStatus.style.color='#b42318';
  geminiSetup.hidden=true;geminiSetup.style.display='none';
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');
  button.disabled=true;status.textContent='Записване...';status.style.color='#617796';
  try{
   const s=await session();
   const data=await request('POST','/api/gemini-key?mode=profile',{
    full_name:form.elements.namedItem('full_name').value,
    city:form.elements.namedItem('city').value,
    phone:form.elements.namedItem('phone').value
   });
   if(data.saved!==true)throw Error('Сървърът не потвърди записа.');
   const now=await session();
   if(markerFor(s)!==markerFor(now))throw Error('Сесията е сменена. Отвори профила отново.');
   confirmSession(now);
   showForm(false);
   showConfirmed(true);
   status.textContent='';
  }catch(error){showError(error)}
  finally{button.disabled=false}
 });
 geminiForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=geminiForm.querySelector('button');
  const key=geminiForm.elements.namedItem('key').value.trim();
  if(!/^(?:AIza[\w-]{20,}|AQ\.[A-Za-z0-9._-]{20,})$/.test(key)){
   geminiStatus.textContent='Постави целия Gemini API ключ от Google AI Studio.';
   geminiStatus.style.color='#b42318';
   return;
  }
  button.disabled=true;
  geminiStatus.textContent='Свързване на Gemini...';
  geminiStatus.style.color='#617796';
  try{
   const result=await request('POST','/api/gemini-key',{key});
   if(result.saved!==true)throw Error('Ключът не е потвърден като запазен.');
   geminiConnected(true);
  }catch(error){
   geminiStatus.textContent='Gemini: '+error.message;
   geminiStatus.style.color='#b42318';
  }finally{
   geminiForm.elements.namedItem('key').value='';
   button.disabled=false;
  }
 });
}
// Preserve the original DAVID navigation and replace only the legacy Tasks CTA.
function attach(){
 const root=document.getElementById('root');if(!root)return;
 const heading=[...root.querySelectorAll('h1,h2')].find(x=>x.textContent?.trim()==='Google профил');
 if(!heading)return;
 if(root.querySelector('#david-gemini-profile'))return;
 const host=heading.closest('.main')||heading.parentElement;
 const taskButton=[...host.querySelectorAll('button,a')].find(el=>/Отвори\s*ЗАДАЧИ/i.test(el.textContent||''));
 if(!taskButton)return;
 const panel=document.createElement('div');
 panel.id='david-gemini-profile';
 taskButton.replaceWith(panel);
 mountProfile(panel);
}
let pending=false;
const observer=new MutationObserver(()=>{
 if(pending)return;
 pending=true;
 queueMicrotask(()=>{pending=false;attach()});
});
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
attach();
