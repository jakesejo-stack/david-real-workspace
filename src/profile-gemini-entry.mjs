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
 if(!response.ok)throw Error('Gemini key request failed');
 return response.json();
}
let attached=false;
function attach(){
 const root=document.getElementById('root');if(!root)return;
 const heading=[...root.querySelectorAll('h1,h2')].find(x=>x.textContent?.trim()==='Google профил');
 if(!heading){attached=false;return;}
 if(root.querySelector('#david-gemini-profile'))return;
 const panel=document.createElement('div');panel.id='david-gemini-profile';
 const host=heading.closest('.main')||heading.parentElement;
 host.append(panel);
 mountOperatorApiPanel(panel,{getConnection:()=>request('GET'),saveKey:key=>request('POST',key)});
 attached=true;
}
const observer=new MutationObserver(()=>{if(!attached||!document.getElementById('david-gemini-profile'))attach()});
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
attach();
