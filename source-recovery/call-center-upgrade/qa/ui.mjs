import {installCallCenterUpgrade} from '/david-modules/call-center-upgrade.mjs';
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={role:'admin',view:'admin',user:{email:'soulflame.mitko@gmail.com'},config:{databaseConfigured:true,serverConfigured:false,telephonyConfigured:false,liveCallsEnabled:false,recordingEnabled:false},members:[{role:'worker'}],companies:[],logs:[]};
let upgrade;
function render(){
 document.getElementById('root').innerHTML='<div class="layout"><aside class="side"><div class="brand">◇ DAVID.</div><div class="brand-sub">SOULFLAME SYSTEMS</div><div class="nav">'+[['tasks','Задачи'],['mycompanies','Моите фирми'],['desk','Live Call Desk'],['records','Разговори'],['admin','Админ панел']].map(([id,label])=>'<button type="button" data-nav="'+id+'">'+label+'</button>').join('')+'</div></aside><div class="page"><div class="top"><span class="chip">QA</span><span class="chip">QA</span><button id="fixtureRole" class="btn">'+(state.role==='admin'?'Провери оператор':'Провери админ')+'</button></div><main class="main" id="content"></main></div></div>';
 document.getElementById('fixtureRole').onclick=()=>{state.role=state.role==='admin'?'worker':'admin';state.view=state.role==='admin'?'admin':'desk';render()};
 document.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>{state.view=button.dataset.nav;render()});
 const content=document.getElementById('content');
 if(state.view==='admin'){
  content.innerHTML='<h1>Admin Panel</h1><p class="muted">QA</p><div class="grid"><section class="card"><h2>DPP Gmail Sync</h2><p>Няма потвърдена синхронизация.</p></section><section class="card"><h2>Права и екип</h2><form id="enroll"><input class="field" placeholder="Gmail на бъдещ оператор"><button class="btn primary" type="button">Добави оператор</button></form><h3 style="margin-top:20px">Одобрени оператори</h3><p class="muted">QA оператор · тестови данни</p></section></div><section class="card"><div class="row"><h2>Фирми</h2><button class="btn" id="reloadAdmin">Обнови</button></div><p>Няма фирми в QA средата.</p></section><section class="card" id="davidGoogleApprovals"><h2>Google заявки за достъп</h2><p class="muted">Няма чакащи заявки.</p></section><section class="card" id="davidMitkoAdminCompanyTask"><h2>Възложи задача</h2><div class="fields"><select class="field"><option>Избери оператор</option></select><input class="field" placeholder="Заглавие на задачата"></div><button class="btn primary" style="margin-top:12px">Възложи</button></section><section class="card" id="davidAdminAllActivity"><h2>Последни резултати</h2><p>Няма реални разговори.</p></section>';
 }else if(state.view==='desk'){upgrade.renderDesk()}
 else content.innerHTML='<h1>'+esc(state.view==='tasks'?'Моите задачи':state.view==='records'?'Разговори':'Моите фирми')+'</h1><div class="card"><p>QA среда · няма реални фирми или обаждания.</p></div>';
 upgrade.afterRender();
}
upgrade=installCallCenterUpgrade({state,escape:esc,toast:message=>alert(message),refresh:()=>{},render,
 loadTask:async()=>{state.davidDailyTask=null;const node=document.getElementById('deskWorkerTask');if(node)node.innerHTML='<h2>Задача и скрипт</h2><p class="muted">Няма назначена задача за днес.</p>'},startTaskCall:()=>{throw Error('QA cannot place calls')},legacyDesk:()=>{}});
render();
