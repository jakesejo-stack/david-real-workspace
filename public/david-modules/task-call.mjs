const phonePattern=/(?:\+[1-9]\d{5,14}|(?<!\d)0\d{9})(?!\d)/;
export function taskPhone(task){
 const value=String(task?.contact_phone||task?.phone||'')+' '+String(task?.instructions||task?.description||'')+' '+String(task?.title||'');
 const raw=value.match(phonePattern)?.[0]||'';
 return /^0\d{9}$/.test(raw)?'+359'+raw.slice(1):raw;
}
export function createTaskCallButton(doc,task){
 const button=doc.createElement('button');
 button.type='button';button.className='david-task-call';
 button.textContent='☎ Call';
 button.setAttribute('aria-label','Обади се по задача '+String(task.title||'Задача'));
 button.title=task.status==='DONE'?'Задачата е приключена':'Отвори разговор за тази задача';
 button.disabled=task.status==='DONE';
 button.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();
  doc.dispatchEvent(new CustomEvent('david:task-call',{detail:{taskId:task.task_id||task.id}}));
 });
 ensureTaskCallStyle(doc);return button;
}
function ensureTaskCallStyle(doc){
 if(doc.getElementById('david-task-call-style'))return;
 const style=doc.createElement('style');style.id='david-task-call-style';
 style.textContent='.david-task-call{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:#16834b;color:#fff;border:1px solid #11713f;border-radius:999px;min-height:44px;padding:9px 16px;font:700 14px system-ui;cursor:pointer;white-space:nowrap;flex-shrink:0}.david-task-call:hover:not(:disabled){background:#106b3c}.david-task-call:focus-visible{outline:3px solid #83d9a6;outline-offset:3px}.david-task-call:disabled{opacity:.45;cursor:not-allowed}.david-task-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.david-task-heading>details{flex:1;min-width:0}.david-task-heading>h3{margin:0;min-width:0;overflow-wrap:anywhere}.dpp-center-card>.david-task-heading{margin-bottom:8px}.david-selected-task{border-left:4px solid #16834b}.david-selected-task p{margin-bottom:7px}@media(max-width:500px){.david-task-heading{align-items:flex-start}.david-task-call{padding:9px 12px}}';
 doc.head.append(style);
}
export async function resolveTaskForCall(db,userId,taskId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(taskId||'')))throw Error('Невалидна задача.');
 const {data:task,error}=await db.from('david_admin_tasks')
  .select('id,title,description,status,company_id,assigned_to').eq('id',taskId).eq('assigned_to',userId).maybeSingle();
 if(error)throw Error('Задачата не може да бъде проверена. Обнови списъка.');
 if(!task||task.status==='DONE')throw Error('Задачата е приключена или вече не е назначена на теб.');
 if(!task.company_id)return {...task,phone:taskPhone(task)};
 const {data:company,error:companyError}=await db.from('david_companies')
  .select('id,company_name,contact_phone,calling_approved,do_not_call')
  .eq('id',task.company_id).eq('assigned_to',userId).maybeSingle();
 if(companyError||!company)throw Error('Фирмата вече не е назначена на теб.');
 const phone=company.calling_approved===true&&company.do_not_call===false?taskPhone({contact_phone:company.contact_phone}):'';
 return {...task,phone,company_name:company.company_name};
}
export function selectionMatchesDaily(selection,dailyTask){
 return !!selection?.phone&&selection.phone===taskPhone(dailyTask);
}
export function installTaskCallBridge({state,render,toast,loadDaily,startCall}){
 let resolving=false;
 function paint(){
  const selected=state.taskCallSelection;
  if(!selected||state.view!=='desk')return;
  const root=document.getElementById('content');if(!root)return;
  let panel=document.getElementById('david-selected-task');
  if(!panel){panel=document.createElement('section');panel.id='david-selected-task';panel.className='card david-selected-task';root.prepend(panel);}
  panel.replaceChildren();
  const heading=document.createElement('h2');heading.textContent=selected.title||'Избрана задача';panel.append(heading);
  const target=document.createElement('p');target.textContent=(selected.company_name?selected.company_name+' · ':'')+(selected.phone||'Няма одобрен телефон към тази задача.');panel.append(target);
  const back=document.createElement('button');back.type='button';back.className='btn';back.textContent='Към задачите';
  back.onclick=()=>{state.view='tasks';render()};panel.append(back);
  const input=document.getElementById('deskManualNumber');
  if(input){input.value=selected.phone||'';input.readOnly=true;}
  const valid=selectionMatchesDaily(selected,state.davidDailyTask);
  const hint=document.createElement('p');hint.className='tiny';hint.setAttribute('role','status');
  hint.textContent=!selected.phone?'Администраторът трябва да добави одобрен номер към задачата.':
   !valid?'Този номер още няма одобрена дневна Twilio задача. Няма да бъде набран друг номер.':
   state.config?.telephonyConfigured?'Номерът съвпада с одобрената дневна задача. Натисни Start Real Call за потвърждение.':'Twilio още не е настроен. Избраната задача е готова в Call Desk.';
  panel.append(hint);
  const start=document.getElementById('deskCallStart');
  if(start){start.textContent='☎ Start Real Call';start.disabled=!valid||!state.config?.telephonyConfigured||!!state.call||!!state.taskCallBusy;}
 }
 document.addEventListener('david:task-call',async event=>{
  if(resolving||state.call||state.taskCallBusy)return toast('Приключи текущия разговор преди нова задача.');
  resolving=true;
  try{
   if(!state.db||!state.user)throw Error('Влез с Google.');
   const selected=await resolveTaskForCall(state.db,state.user.id,event.detail?.taskId);
   state.taskCallSelection=selected;state.davidCallMode='real';state.freeDeskMode=true;state.view='desk';render();paint();
  }catch(error){toast(error.message)}finally{resolving=false;}
 });
 return {
  async loadDaily(){const result=await loadDaily();paint();return result;},
  startCall(){
   if(state.taskCallSelection&&!selectionMatchesDaily(state.taskCallSelection,state.davidDailyTask))return toast('Избраната задача няма съвпадащ одобрен номер за Twilio.');
   return startCall();
  }
 };
}
