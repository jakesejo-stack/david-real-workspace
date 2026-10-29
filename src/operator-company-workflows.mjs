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
