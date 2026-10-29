// Call Desk source-level integration. Must be mounted in restored original Vite UI.
export const OUTCOMES = Object.freeze({
 no_answer: 'Не отговориха',
 callback: 'Ще се обадят отново',
 followup: 'Трябва повторен контакт',
 interested: 'Проявиха интерес',
 declined: 'Отказ',
 contacted: 'Проведен контакт',
 do_not_contact: 'Не търси повече',
 note: 'Само бележка'
});

async function rpc(db, name, args) {
 const {data,error} = await db.rpc(name, args);
 if (error) throw error;
 return data;
}

export function validateApplication(input) {
 const name=String(input.name||'').trim(),country=String(input.country||'').trim();
 const phone=String(input.phone||'').trim();
 const languages=Array.from(new Set((input.languages||[]).map(x=>String(x).trim()).filter(Boolean)));
 if(name.length<2||name.length>120||country.length<2||country.length>80
 || !/^[+][1-9][0-9]{5,14}$/.test(phone)
 || !languages.length||languages.length>12||languages.some(x=>x.length>40))
 throw new Error('Попълни име, държава, поне един език и международен телефон.');
 return {name,country,phone,languages};
}

export async function submitApplication(db,input) {
 const p=validateApplication(input);
 const result=await rpc(db,'david_operator_submit_application',{
 p_full_name:p.name,p_country:p.country,p_languages:p.languages,p_phone:p.phone
 });
 if (result?.ok!==true) throw new Error('Кандидатурата не е записана.');
 return result;
}
export async function adminApplications(db) {
 const result=await rpc(db,'david_admin_google_access_requests');
 if (result?.ok!==true||!Array.isArray(result.requests)) throw new Error('Невалидни кандидатури');
 return result.requests;
}
export async function adminCreateCompanyTask(db,params) {
 const result=await rpc(db,'david_admin_create_company_task',{
 p_worker_user_id:params.workerId,p_company_id:params.companyId,
 p_title:params.title,p_description:params.description||'',
 p_priority:params.priority||'P2',p_due_at:params.dueAt||null
 });
 if (result?.ok!==true) throw new Error('Задачата не е записана.');
 return result;
}
export async function myTasks(db) {
 const result=await rpc(db,'david_worker_my_tasks');
 if (!Array.isArray(result)) throw new Error('Невалиден списък със задачи');
 return result;
}
export async function saveTaskContact(db,params) {
 if (!Object.hasOwn(OUTCOMES,params.outcome)) throw new Error('Невалиден резултат');
 const result=await rpc(db,'david_worker_save_task_interaction',{
 p_task_id:params.taskId,p_outcome:params.outcome,
 p_notes:params.notes||'',p_followup_at:params.followupAt||null,
 p_contact_confirmed:params.confirmed===true
 });
 if (result?.ok!==true) throw new Error('Резултатът не е потвърден.');
 return result;
}
export async function myCompanies(db,search='') {
 const result=await rpc(db,'david_worker_my_companies',{p_query:String(search).slice(0,120)});
 if (!Array.isArray(result)) throw new Error('Невалиден списък с фирми');
 return result;
}
export async function companyDetail(db,companyId) {
 const result=await rpc(db,'david_worker_company_detail',{p_company_id:companyId});
 if(result?.ok!==true) throw new Error('Нямаш достъп до тази фирма');
 return result;
}

function el(doc,tag,text='',attrs={}) {
 const x=doc.createElement(tag);
 x.textContent=String(text);
 for (const [key,value] of Object.entries(attrs)) x.setAttribute(key,String(value));
 return x;
}
function field(doc,label,type='text',value='') {
 const box=el(doc,'label');box.append(el(doc,'span',label));
 const input=el(doc,'input');input.type=type;input.value=value;box.append(input);
 return {box,input};
}
function showError(container,err) {
 container.append(el(container.ownerDocument,'p',String(err?.message||err),{role:'alert'}));
}

export function mountOperatorApplication(container,db) {
 const d=container.ownerDocument;
 container.replaceChildren(el(d,'h2','Кандидатстване за оператор'));
 const form=el(d,'form');
 const name=field(d,'Име и фамилия'),country=field(d,'Държава');
 const languages=field(d,'Говорими езици (разделени със запетая)');
 const phone=field(d,'Телефон с международен код (напр. +359...)','tel');
 const submit=el(d,'button','Изпрати за одобрение');submit.type='submit';
 form.append(name.box,country.box,languages.box,phone.box,submit);
 form.addEventListener('submit',async event=>{
  event.preventDefault();submit.disabled=true;
  try{
   await submitApplication(db,{name:name.input.value,country:country.input.value,
    languages:languages.input.value.split(','),phone:phone.input.value});
   form.replaceChildren(el(d,'p','Кандидатурата е изпратена. Очаква одобрение от администратор.'));
  }catch(e){showError(form,e);submit.disabled=false}
 });
 container.append(form);return form;
}

export async function mountAdminApplications(container,db) {
 const d=container.ownerDocument;
 container.replaceChildren(el(d,'h2','Кандидатури за оператор'));
 try {
  for(const a of await adminApplications(db)){
   const card=el(d,'section');
   card.append(el(d,'strong',a.name+' — '+a.email));
   card.append(el(d,'p','Държава: '+a.country));
   card.append(el(d,'p','Езици: '+(a.languages||[]).join(', ')));
   card.append(el(d,'p','Телефон: '+a.phone));
   card.append(el(d,'p','Статус: '+a.status));
   if(a.status==='pending'){
    const role=el(d,'select');
    for(const v of ['operator','test','test2']) {
     const o=el(d,'option',v);o.value=v;role.append(o);
    }
    const approve=el(d,'button','Одобри');approve.type='button';
    approve.addEventListener('click',async()=>{
     approve.disabled=true;
     try{
      const r=await rpc(db,'david_admin_review_google_access',{
       p_user_id:a.user_id,p_approve:true,p_operator_kind:role.value});
      if(r?.ok!==true)throw new Error('Одобрението не е потвърдено');
      await mountAdminApplications(container,db);
     }catch(e){showError(card,e);approve.disabled=false}
    });
    card.append(role,approve);
   }
   container.append(card);
  }
 }catch(e){showError(container,e)}
}

export async function mountAdminCompanyTask(container,db,companies) {
 const d=container.ownerDocument;
 container.replaceChildren(el(d,'h2','Нова задача за фирма'));
 const {getApprovedWorkers}=await import('./admin-worker-picker.mjs');
 try {
  const workers=await getApprovedWorkers(db);
  const form=el(d,'form'),assignee=el(d,'select'),company=el(d,'select');
  assignee.append(el(d,'option','Избери одобрен Gmail'));
  for(const w of workers){const o=el(d,'option',w.label);o.value=w.id;assignee.append(o)}
  company.append(el(d,'option','Избери фирма'));
  for(const c of companies){const o=el(d,'option',c.company_name);o.value=c.id;company.append(o)}
  const title=field(d,'Задача'),notes=field(d,'Инструкции');
  const send=el(d,'button','Възложи задачата');send.type='submit';
  form.append(assignee,company,title.box,notes.box,send);
  form.addEventListener('submit',async e=>{
   e.preventDefault();send.disabled=true;
   try{
    if(!workers.some(w=>w.id===assignee.value)||!companies.some(c=>c.id===company.value))
     throw new Error('Избери оператор и фирма');
    const result=await adminCreateCompanyTask(db,{
     workerId:assignee.value,companyId:company.value,
     title:title.input.value,description:notes.input.value});
    form.append(el(d,'p','Задача '+result.task_id+' е възложена на '+result.recipient));
   }catch(err){showError(form,err)}finally{send.disabled=false}
  });
  container.append(form);
 }catch(err){showError(container,err)}
}

export async function mountWorkerTasks(container,db,afterSave=()=>{}) {
 const d=container.ownerDocument;
 container.replaceChildren(el(d,'h2','Моите задачи'));
 try{
  const tasks=await myTasks(db);
  if(!tasks.length)container.append(el(d,'p','Все още няма възложени задачи.'));
  for(const task of tasks){
   const card=el(d,'section');
   card.append(el(d,'h3',task.title+' — '+(task.company_name||'Обща задача')));
   card.append(el(d,'p',task.description||''));
   card.append(el(d,'p','Статус: '+task.status));
   if(task.company_id){
    const form=el(d,'form'),outcome=el(d,'select');
    for(const [value,label] of Object.entries(OUTCOMES)){
     const o=el(d,'option',label);o.value=value;outcome.append(o);
    }
    const note=field(d,'Бележки'),next=field(d,'Следващо обаждане (дата/час)','datetime-local');
    const check=field(d,'');check.input.type='checkbox';
    check.box.firstChild.textContent='Потвърждавам, че контактът е реален (или избери само бележка)';
    const save=el(d,'button','Запази резултата');save.type='submit';
    form.append(outcome,note.box,next.box,check.box,save);
    form.addEventListener('submit',async e=>{
     e.preventDefault();save.disabled=true;
     try{
      const follow=next.input.value?new Date(next.input.value).toISOString():null;
      await saveTaskContact(db,{taskId:task.task_id,outcome:outcome.value,
       notes:note.input.value,followupAt:follow,confirmed:check.input.checked});
      await mountWorkerTasks(container,db,afterSave);
      afterSave();
     }catch(err){showError(form,err);save.disabled=false}
    });
    card.append(form);
   }
   container.append(card);
  }
 }catch(err){showError(container,err)}
}

export async function mountMyCompanies(container,db) {
 const d=container.ownerDocument;
 container.replaceChildren(el(d,'h2','Моите фирми'));
 const search=field(d,'Търси по фирма, държава или сектор','search');
 const list=el(d,'section'),detail=el(d,'section');
 container.append(search.box,list,detail);
 let request=0;
 async function run(){
  const requestId=++request;
  list.replaceChildren(el(d,'p','Зареждане...'));
  try {
   const rows=await myCompanies(db,search.input.value);
   if(requestId!==request)return;
   list.replaceChildren();
   if(!rows.length)list.append(el(d,'p','Няма фирми, по които си работил. Те се запазват тук след отчетен контакт от задача.'));
   for(const c of rows){
    const button=el(d,'button',c.company_name+' — '+c.country+
     ' · Мои контакти: '+c.my_contact_count+
     (c.last_outcome?' · '+(OUTCOMES[c.last_outcome]||c.last_outcome):''));
    button.type='button';
    button.addEventListener('click',()=>openDetail(c.company_id));
    list.append(button);
   }
  }catch(err){list.replaceChildren();showError(list,err)}
 }

 async function openDetail(companyId){
  detail.replaceChildren(el(d,'p','Зареждане на фирмата...'));
  try{
   const result=await companyDetail(db,companyId);
   const info=result.company;
   detail.replaceChildren(el(d,'h3',info.name));
   for(const [label,value] of [
    ['Държава',info.country],['Град',info.city],['Сектор',info.sector],
    ['Информация',info.research_notes],['Контакт',info.contact_name],
    ['Имейл',info.contact_email],['Телефон',info.contact_phone]]){
    if(value) detail.append(el(d,'p',label+': '+value));
   }
   detail.append(el(d,'h4','Моите задачи'));
   for(const t of result.tasks) detail.append(el(d,'p',t.title+' · '+t.status));
   detail.append(el(d,'h4','Моята история на контактите'));
   if(!result.my_history.length) detail.append(el(d,'p','Няма записани контакти.'));
   for(const entry of result.my_history){
    const when=new Date(entry.created_at).toLocaleString('bg-BG');
    const next=entry.followup_at?' · Следващо: '+new Date(entry.followup_at).toLocaleString('bg-BG'):'';
    detail.append(el(d,'p',when+' · '+(OUTCOMES[entry.outcome]||entry.outcome)
     +(entry.notes?' · '+entry.notes:'')+next+' · Операторски отчет'));
   }
  }catch(err){detail.replaceChildren();showError(detail,err)}
 }
 search.input.addEventListener('input',run);
 await run();
 return {refresh:run};
}

// Admin-only summary. The database enforces authorization/RLS; never fetch other
// workers' history into a worker session. A note is not an audio transcript.
export async function mountAdminActivity(container,db) {
 const d=container.ownerDocument;
 container.replaceChildren(el(d,'h2','Оператори, фирми и история на контактите'));
 const search=field(d,'Търси оператор, фирма, държава или бележка','search');
 const status=el(d,'p','Зареждане...'),result=el(d,'section');
 container.append(search.box,status,result);
 let entries=[];
 try {
  const [members,companies,interactions]=await Promise.all([
   db.from('david_members').select('user_id,role,display_name').limit(500),
   db.from('david_companies').select('id,company_name,country,assigned_to').limit(5000),
   db.from('david_company_interactions').select('id,company_id,worker_user_id,outcome,notes,created_at,source,followup_at').order('created_at',{ascending:false}).limit(2000)
  ]);
  for(const x of [members,companies,interactions])if(x.error)throw x.error;
  const people=new Map((members.data||[]).map(x=>[x.user_id,x]));
  const firms=new Map((companies.data||[]).map(x=>[x.id,x]));
  entries=(interactions.data||[]).map(x=>({ ...x,worker:people.get(x.worker_user_id),company:firms.get(x.company_id)}));
  status.textContent='Оператори: '+(members.data||[]).filter(x=>x.role==='worker').length+
   ' · Фирми: '+firms.size+' · Записани операторски отчети: '+entries.length+
   ' (не са аудиозаписи или автоматична транскрипция).';
  const roster=el(d,'section');roster.className='card';container.insertBefore(roster,result);
  roster.append(el(d,'h3','Всички оператори'));
  for(const p of (members.data||[]).filter(x=>x.role==='worker')){
   const assigned=(companies.data||[]).filter(c=>c.assigned_to===p.user_id).length;
   const worked=entries.filter(e=>e.worker_user_id===p.user_id).length;
   roster.append(el(d,'p',(p.display_name||p.user_id)+' · Назначени фирми: '+assigned+' · Отчети: '+worked));
  }
  roster.append(el(d,'h3','Всички фирми'));
  for(const c of (companies.data||[])){
   const owner=people.get(c.assigned_to);
   roster.append(el(d,'p',(c.company_name||c.id)+' · '+(c.country||'')+
    ' · Оператор: '+(owner?.display_name||'Неназначена')));
  }
  const render=()=>{
   const q=search.input.value.trim().toLocaleLowerCase('bg-BG');
   const rows=entries.filter(x=>[x.worker?.display_name,x.company?.company_name,x.company?.country,x.notes,x.outcome]
    .some(v=>String(v||'').toLocaleLowerCase('bg-BG').includes(q)));
   result.replaceChildren();
   for(const x of rows.slice(0,250)){
    const card=el(d,'article');card.className='company';
    card.append(el(d,'strong',(x.worker?.display_name||x.worker_user_id)+' · '+(x.company?.company_name||x.company_id)));
    card.append(el(d,'p',new Date(x.created_at).toLocaleString('bg-BG')+' · '+(OUTCOMES[x.outcome]||x.outcome)));
    if(x.notes)card.append(el(d,'p','Отчет на оператора: '+x.notes));
    if(x.followup_at)card.append(el(d,'p','Следващ контакт: '+new Date(x.followup_at).toLocaleString('bg-BG')));
    result.append(card);
   }
   if(!rows.length)result.append(el(d,'p','Няма записани контакти по тази търсачка.'));
  };
  search.input.addEventListener('input',render);render();
 }catch(e){status.textContent='Администраторският отчет е недостъпен: '+String(e?.message||e)}
}
