import {createClient} from '@supabase/supabase-js';

let client=null;
async function session(){
 const config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
 if(!config.supabaseUrl||!config.supabaseAnonKey)throw Error('No auth configuration');
 if(!client)client=createClient(config.supabaseUrl,config.supabaseAnonKey);
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Google login required');
 return session;
}
async function request(method,path,body){
 const token=(await session()).access_token;
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Неуспешна заявка');
 return result;
}
function mountProfile(panel){
 const section=document.createElement('section');section.className='card';
 section.innerHTML='<h2>Моят профил в SoulFlame</h2><p class="muted">Информацията се запазва към твоя Google акаунт в защитената база на DAVID.</p><form class="stack" id="david-personal-profile"><label>Имена<input name="full_name" class="field" maxlength="120" required autocomplete="name"></label><label>Град<input name="city" class="field" maxlength="100" required autocomplete="address-level2"></label><label>Телефонен номер<input name="phone" class="field" maxlength="40" required autocomplete="tel"></label><label>Потвърден Gmail<input name="gmail" class="field" type="email" readonly></label><button class="btn primary" type="submit">Запази профила</button><p role="status" aria-live="polite" id="david-profile-status"></p></form><p class="tiny">Gemini ключът остава защитен на сървъра и не се показва в профила. Историята на Soulflame AI се запазва отделно за всеки оператор.</p>';
 panel.replaceChildren(section);
 const form=section.querySelector('form'),status=section.querySelector('#david-profile-status');
 const set=(name,value)=>{form.elements.namedItem(name).value=value||''};
 request('GET','/api/gemini-key?mode=profile').then(data=>{const p=data.profile||{};for(const k of ['full_name','city','phone'])set(k,p[k]);set('gmail',data.verifiedEmail);}).catch(error=>{status.textContent=error.message;status.style.color='#b42318'});
 form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Записване...';try{await request('POST','/api/gemini-key?mode=profile',{full_name:form.elements.namedItem('full_name').value,city:form.elements.namedItem('city').value,phone:form.elements.namedItem('phone').value});status.textContent='✓ Профилът е запазен успешно в DAVID.';status.style.color='#167347'}catch(error){status.textContent=error.message;status.style.color='#b42318'}finally{button.disabled=false}});
}
// Keep the original DAVID profile layout, but replace its blue Tasks CTA
// with the Gemini setup workflow. No browser storage is used for API keys.
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
