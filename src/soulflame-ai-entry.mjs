import {createClient} from '@supabase/supabase-js';
let supabase;
async function authToken(){
 const config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
 if(!supabase)supabase=createClient(config.supabaseUrl,config.supabaseAnonKey);
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw Error('Влез първо с Google.');
 return session.access_token;
}
let visible=false;
function install(){
 const root=document.getElementById('root');
 if(!root)return;
 const nav=[...root.querySelectorAll('button')].find(b=>b.textContent?.includes('Support Tickets')&&b.closest('.nav'));
 if(!nav)return;
 const parent=nav.parentElement;
 if(parent.querySelector('#soulflame-ai-nav'))return;
 const btn=document.createElement('button');btn.id='soulflame-ai-nav';btn.textContent='✦ Soulflame AI';btn.type='button';
 nav.after(btn);
 const main=root.querySelector('.main');
 if(!main)return;
 const panel=document.createElement('section');panel.id='soulflame-ai-view';panel.className='hidden';
 panel.innerHTML='<div class="card"><div class="row"><div><h1>✦ Soulflame AI</h1><p class="muted">DAVID AI асистент, свързан с Gemini ключа от твоя Google профил.</p></div><span id="sf-ai-state" class="tag gray">Проверка...</span></div><div id="sf-ai-messages" class="stack" style="min-height:180px;max-height:55vh;overflow:auto;padding:14px;background:#f6f9fe;border-radius:12px;margin:14px 0" aria-live="polite"></div><form id="sf-ai-form" class="stack"><label for="sf-ai-prompt">Напиши въпрос към DAVID</label><textarea id="sf-ai-prompt" class="field" rows="3" maxlength="4000" placeholder="Попитай за DPP, клиенти, скрипт за обаждане..."></textarea><button class="btn primary" type="submit">Изпрати към Soulflame AI</button></form><p class="tiny">Съобщенията се изпращат до Google Gemini чрез личния ти API ключ. Не въвеждай поверителни данни за клиенти без разрешение.</p></div>';
 main.append(panel);
 const state=panel.querySelector('#sf-ai-state'),form=panel.querySelector('#sf-ai-form'),prompt=panel.querySelector('#sf-ai-prompt'),messages=panel.querySelector('#sf-ai-messages');
 const add=(who,message)=>{const item=document.createElement('div');item.className='notice';item.style.background=who==='DAVID'?'#e8f2ff':'#fff';const strong=document.createElement('strong');strong.textContent=who+': ';item.append(strong,document.createTextNode(message));messages.append(item);messages.scrollTop=messages.scrollHeight;};
 const check=async()=>{try{const token=await authToken();const r=await fetch('/api/gemini-key',{headers:{Authorization:'Bearer '+token}});const data=await r.json();state.textContent=data.connected?'✓ Gemini свързан':'Gemini не е свързан';state.className='tag '+(data.connected?'green':'orange');}catch{state.textContent='Не може да се провери връзката';state.className='tag red';}};
 btn.addEventListener('click',()=>{visible=true;main.querySelectorAll(':scope > *').forEach(el=>{if(el!==panel)el.style.display='none'});panel.classList.remove('hidden');parent.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');check();});
 parent.addEventListener('click',event=>{if(event.target===btn||btn.contains(event.target))return;if(!visible)return;visible=false;panel.classList.add('hidden');btn.classList.remove('active');main.querySelectorAll(':scope > *').forEach(el=>{if(el!==panel)el.style.removeProperty('display')});},true);
 form.addEventListener('submit',async e=>{e.preventDefault();const message=prompt.value.trim();if(!message)return;const send=form.querySelector('button');send.disabled=true;add('Ти',message);prompt.value='';try{const token=await authToken();const r=await fetch('/api/soulflame-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({message})});const data=await r.json();if(!r.ok)throw Error(data.error||'AI error');add('DAVID',data.reply);}catch(error){add('Система',error.message);}finally{send.disabled=false;}});
}
const observer=new MutationObserver(()=>install());observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});install();
