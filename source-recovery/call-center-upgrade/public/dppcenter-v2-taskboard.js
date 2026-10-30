/* DppCenter integration for recovered ORIGINAL Vite app.
   No independent auth, credentials, or cross-origin tokens.
   Host supplies same-origin authenticated API adapter (see docs/DPP-CENTER-V2-HANDOFF.md).
*/
export function mountDppTaskCenter(root,{api,role='worker',workers=[]}={}){
  if(!(root instanceof HTMLElement))throw new Error('Expected a host element');
  for(const key of ['listTasks','createTask','updateStatus','addNote']){
    if(typeof api?.[key]!=='function')throw new Error('Missing authorized task API: '+key);
  }
  const admin=role==='admin';
  const create=(tag,cl,text)=>{
    const el=document.createElement(tag);if(cl)el.className=cl;
    if(text!==undefined)el.textContent=String(text);return el;
  };
  const shell=create('div','dpp-center-shell');
  const nav=create('nav','dpp-center-nav');nav.setAttribute('aria-label','DPP меню');
  const brand=create('div','dpp-center-brand','DPP ☎ CENTER');
  const taskButton=create('button','dpp-nav-task','☷ ЗАДАЧИ');
  const firmsButton=create('button','dpp-nav-firms','▦ Моите фирми');
  const head=create('div','dpp-center-head');
  const content=create('section','dpp-center-content');
  const tasksBox=create('div','dpp-center-list');
  const hint=create('small','dpp-center-sync','Синхронизация на 10 секунди');
  const title=create('h2','',admin?'Задачи на екипа':'Моите нови задачи');
  // This uses the existing authenticated DAVID navigation. It never places a call.
  const openLiveDesk=()=>{
    const entry=document.querySelector('button[data-nav="desk"]');
    if(!entry){hint.textContent='Live Call Desk временно не е достъпен.';return;}
    entry.click();
  };
  const deskShortcut=create('button','dpp-center-call-shortcut','☎ Live Call Desk');
  deskShortcut.type='button';
  deskShortcut.addEventListener('click',openLiveDesk);
  head.append(title,deskShortcut,hint);content.append(head,tasksBox);
  nav.append(brand,taskButton,firmsButton);
  const body=create('main','dpp-center-body');body.append(content);
  shell.append(nav,body);root.replaceChildren(shell);
  const initialTaskFocus=()=>content.scrollIntoView({behavior:'smooth',block:'start'});
  taskButton.addEventListener('click',initialTaskFocus);
  firmsButton.addEventListener('click',()=>root.dispatchEvent(new CustomEvent('dpp:open-companies',{bubbles:true})));
  let alive=true,loading=false;
  const makeAction=async (fn)=>{
    try{await fn();await sync();}
    catch(err){hint.textContent='Грешка: '+String(err?.message||'неуспешна операция');}
  };
  async function sync(){
    if(!alive||loading)return;loading=true;
    try{
      const data=await api.listTasks();
      if(!alive)return;
      if(!Array.isArray(data?.tasks))throw new Error('Invalid task list response');
      const tasks=data.tasks;
      const active=tasks.filter(t=>t.status!=='DONE').length;
      tasksBox.replaceChildren();
      const summary=create('div','dpp-tasks-result',tasks.length
        ?'✅ Има задачи: '+tasks.length+' общо, '+active+' активни.'
        :'📭 Няма задачи. Засега нямаш възложена работа.');
      summary.setAttribute('role','status');
      summary.setAttribute('aria-live','polite');
      tasksBox.append(summary);
      for(const item of tasks){
        const card=create('article','dpp-center-card');
        const details=create('details','dpp-center-details');
        const summary=create('summary','dpp-center-task-title');
        summary.append(create('strong','',item.title||'Задача'));
        summary.append(create('small','',String(item.priority||'P2')+' · '+String(item.status||'TODO')));
        details.append(summary,create('p','dpp-center-instructions',item.description||''));
        const controls=create('div','dpp-center-controls');
        const status=create('select','dpp-center-status');
        for(const [v,label]of [['TODO','Нова'],['IN_PROGRESS','В процес'],['BLOCKED','Блокирана'],['REVIEW','За преглед'],['DONE','Готова']]){
          const opt=create('option','',label);opt.value=v;status.append(opt);
        }
        status.value=item.status||'TODO';
        status.addEventListener('change',()=>makeAction(()=>api.updateStatus(item.id,status.value)));
        controls.append(status);
        if(item.status!=='DONE'){
          const callButton=create('button','dpp-center-task-call','☎ Към разговор');
          callButton.type='button';
          callButton.setAttribute('aria-label','Отвори Live Call Desk за задача '+(item.title||''));
          callButton.addEventListener('click',openLiveDesk);
          controls.append(callButton);
        }
        const notes=create('div','dpp-center-notes');
        for(const note of Array.isArray(item.notes)?item.notes:[]){
          notes.append(create('p','',note.message||''));
        }
        const noteForm=create('form','dpp-center-form');
        const input=create('textarea','','');input.placeholder='Бележка към задачата';input.maxLength=1500;input.required=true;
        const save=create('button','','+ Запиши бележка');save.type='submit';
        noteForm.append(input,save);
        noteForm.addEventListener('submit',e=>{
          e.preventDefault();
          if(!input.value.trim())return;
          makeAction(()=>api.addNote(item.id,input.value.trim()));
        });
        details.append(controls,notes,noteForm);card.append(details);tasksBox.append(card);
      }
      if(!tasks.length)tasksBox.append(create('p','dpp-center-empty','Когато администратор ти възложи задача, тя ще се появи тук автоматично.'));
      hint.textContent='Обновено: '+new Date().toLocaleTimeString('bg-BG');
    }catch(err){hint.textContent='Връзката със задачите е временно недостъпна.';}
    finally{loading=false;}
  }
  if(admin){
    const form=create('form','dpp-center-form dpp-center-create');
    form.append(create('h3','','+ Създай нова задача'));
    const picker=create('select');picker.required=true;
    const choose=create('option','','Избери оператор');choose.value='';picker.append(choose);
    for(const worker of workers){
      const opt=create('option','',worker.name||worker.email);opt.value=worker.email;picker.append(opt);
    }
    const taskTitle=create('input');taskTitle.placeholder='Заглавие';taskTitle.minLength=4;taskTitle.maxLength=180;taskTitle.required=true;
    const description=create('textarea');description.placeholder='Инструкции';description.maxLength=5000;
    const priority=create('select');
    for(const p of ['P0','P1','P2','P3']){const opt=create('option','',p);opt.value=p;priority.append(opt);}
    priority.value='P1';
    const submit=create('button','','+ Възложи');submit.type='submit';
    form.append(picker,taskTitle,description,priority,submit);
    form.addEventListener('submit',e=>{
      e.preventDefault();
      makeAction(async()=>{await api.createTask({email:picker.value,title:taskTitle.value,description:description.value,priority:priority.value});taskTitle.value='';description.value='';});
    });
    content.insertBefore(form,tasksBox);
  }
  const interval=setInterval(()=>{if(!document.hidden)sync();},10000);
  window.addEventListener('focus',sync);
  sync();
  return ()=>{alive=false;clearInterval(interval);window.removeEventListener('focus',sync);root.replaceChildren();};
}
