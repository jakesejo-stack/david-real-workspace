import {createClient} from '@supabase/supabase-js';
import {mountOperatorApiPanel} from './operator-api-panel.mjs';
let client=null;
async function session(){
 const config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
 if(!config.supabaseUrl||!config.supabaseAnonKey)throw Error('No auth configuration');
 if(!client)client=createClient(config.supabaseUrl,config.supabaseAnonKey);
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token)throw Error('Google login required');
 return session;
}
async function request(method,key){
 const s=await session();
 const response=await fetch('/api/gemini-key',{method,headers:{
  Authorization:'Bearer '+s.access_token,...(key?{'Content-Type':'application/json'}:{})
 },...(key?{body:JSON.stringify({key})}:{})});
 if(!response.ok){const body=await response.json().catch(()=>({}));const err=new Error(body.error||'Gemini key request failed');err.status=response.status;throw err;}
 return response.json();
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
 mountOperatorApiPanel(panel,{
  getConnection:()=>request('GET'),
  saveKey:key=>request('POST',key)
 });
}
let pending=false;
const observer=new MutationObserver(()=>{
 if(pending)return;
 pending=true;
 queueMicrotask(()=>{pending=false;attach()});
});
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
attach();
