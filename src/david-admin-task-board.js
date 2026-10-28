/**
 * DAVID Admin Tasks panel (isolated source module, NOT mounted in production).
 * Mount after original Vite source is recovered:
 *   import { mountDavidAdminTasks } from './david-admin-task-board.js'
 *   await mountDavidAdminTasks(document.getElementById('admin-tasks'), supabase)
 * All authorization is enforced in Supabase RLS. Never put service-role keys in a browser.
 */
export async function mountDavidAdminTasks(container, supabase) {
  if (!container || !supabase) throw new Error('Container and authenticated Supabase client required');

  container.innerHTML = `
  <section class="david-task-board" aria-label="DAVID admin tasks">
    <style>
      .david-task-board{font:14px/1.5 system-ui,Arial,sans-serif;color:#ebf5ff;background:#111c2d;border:1px solid #34445a;border-radius:16px;padding:20px;max-width:1160px;margin:auto}
      .david-task-board *{box-sizing:border-box}.david-task-board h2{font-size:22px;margin:0 0 6px}
      .david-task-board p{color:#adbdd0}.david-task-board label{font-size:12px;color:#b8cce0;display:flex;flex-direction:column;gap:4px}
      .david-task-board input,.david-task-board textarea,.david-task-board select{width:100%;border:1px solid #45566e;border-radius:8px;background:#0c1525;color:#f2f7fc;padding:9px;font:inherit}
      .david-task-board button{background:#126f75;color:white;border:0;border-radius:8px;padding:10px 14px;font:inherit;cursor:pointer}
      .david-task-board button:disabled{opacity:.5;cursor:wait}.david-task-board button.secondary{background:#34445a}
      .david-task-board .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .david-task-board .new-form{display:grid;gap:10px;background:#1a2b40;padding:15px;border-radius:12px;margin:16px 0}
      .david-task-board .task-list{display:grid;gap:9px}.david-task-board .task{border:1px solid #34445a;border-radius:10px;padding:13px;background:#172338}
      .david-task-board .task-head{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
      .david-task-board .task-body{white-space:pre-wrap;word-break:break-word;color:#c4d1e0}
      .david-task-board .pill{background:#263f52;border-radius:30px;padding:3px 9px;font-size:12px}
      .david-task-board .task-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:end}
      .david-task-board .task-controls label{min-width:130px;flex:1}
      .david-task-board .comments{padding:12px 0}.david-task-board .comment{border-top:1px solid #34445a;padding:9px 0;white-space:pre-wrap;word-break:break-word}
      .david-task-board .error{color:#ffbdbd}.david-task-board .success{color:#a5f5d4}
      @media(max-width:680px){.david-task-board{padding:12px}.david-task-board .grid{grid-template-columns:1fr}}
    </style>
    <h2>DAVID · Общи задачи</h2>
    <p>Само за одобрени администратори. ЧатGPT е отделен клиент и трябва да бъде свързан с проекта.</p>
    <div role="status" aria-live="polite" data-status>Проверка на Google сесията…</div>
    <form class="new-form" data-form hidden>
      <label>Задача <input name="title" minlength="4" maxlength="180" required placeholder="Например: QA на DPP операторски вход"></label>
      <label>Описание <textarea name="description" maxlength="6000" rows="3" placeholder="Какво точно трябва да стане"></textarea></label>
      <div class="grid">
        <label>Отговорник <select name="assigned_to"></select></label>
        <label>Приоритет <select name="priority"><option>P0</option><option>P1</option><option selected>P2</option><option>P3</option></select></label>
        <label>Срок <input name="due_at" type="datetime-local"></label>
      </div>
      <button type="submit">Създай задача</button>
    </form>
    <div class="task-controls">
      <label>Статус <select data-filter><option value="">Всички</option><option>TODO</option><option>IN_PROGRESS</option><option>BLOCKED</option><option>REVIEW</option><option>DONE</option></select></label>
      <button type="button" class="secondary" data-reload>Обнови</button>
    </div>
    <div class="task-list" data-list></div>
    <div data-comments></div>
  </section>`;

  const $ = selector => container.querySelector(selector);
  const stateEl = $('[data-status]'), form = $('[data-form]');
  const list = $('[data-list]'), commentSlot = $('[data-comments]');
  const [auth, membersResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('david_members').select('user_id,display_name,role').eq('role','admin')
  ]);
  const user = auth.data?.user;
  const admins = membersResult.data || [];
  if (!user || membersResult.error || !admins.some(m => m.user_id === user.id)) {
    stateEl.className='error';
    stateEl.textContent='Нужен е активен Google ADMIN акаунт. Влез и опитай отново.';
    return;
  }
  const adminNames = new Map(admins.map(m=>[m.user_id,m.display_name || 'Admin']));
  const assignee = form.elements.namedItem('assigned_to');
  const placeholder = new Option('Без отговорник', '');
  assignee.append(placeholder);
  admins.forEach(m=>assignee.append(new Option(m.display_name || m.user_id, m.user_id)));
  stateEl.textContent='Администраторски достъп. Задачите се записват в DAVID Supabase.';
  stateEl.className='success';
  form.hidden=false;

  function element(tag, text, className) {
    const e=document.createElement(tag);
    if (text!==undefined && text!==null) e.textContent=String(text);
    if(className)e.className=className;
    return e;
  }
  function setStatus(message, failed=false) {
    stateEl.textContent=message;stateEl.className=failed?'error':'success';
  }
  async function reload() {
    list.replaceChildren(element('p','Зареждане…'));
    const status=$('[data-filter]').value;
    let q=supabase.from('david_admin_tasks').select('id,title,description,status,priority,assigned_to,created_by,source,due_at,created_at,updated_at').order('created_at',{ascending:false}).limit(100);
    if(status)q=q.eq('status',status);
    const {data,error}=await q;
    if(error){list.replaceChildren();setStatus('Не мога да прочета задачите: '+error.message,true);return;}
    list.replaceChildren();
    if(!data?.length)list.append(element('p','Няма задачи за този филтър.'));
    for(const task of (data || [])){
      const card=element('article',null,'task');
      const head=element('div',null,'task-head');
      head.append(element('strong',task.title),element('span',task.priority+' · '+task.status,'pill'));
      card.append(head);
      if(task.description)card.append(element('p',task.description,'task-body'));
      const meta=element('p','Отговорник: '+(adminNames.get(task.assigned_to)||'Неназначена')+
        (task.due_at?' · Срок: '+new Date(task.due_at).toLocaleString('bg-BG'):''));
      card.append(meta);
      const controls=element('div',null,'task-controls');
      const statusLabel=element('label','Промени статус');
      const statusSelect=element('select');
      ['TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE'].forEach(s=>statusSelect.append(new Option(s,s)));
      statusSelect.value=task.status;
      statusSelect.addEventListener('change',async()=>{
        statusSelect.disabled=true;
        const result=await supabase.from('david_admin_tasks').update({status:statusSelect.value}).eq('id',task.id);
        statusSelect.disabled=false;
        if(result.error){setStatus('Не е записан статусът: '+result.error.message,true);statusSelect.value=task.status;return;}
        setStatus('Статусът е записан.');await reload();
      });
      statusLabel.append(statusSelect);
      const details=element('button','Коментари','secondary');details.type='button';
      details.addEventListener('click',()=>openComments(task));
      controls.append(statusLabel,details);card.append(controls);list.append(card);
    }
  }
  async function openComments(task) {
    commentSlot.replaceChildren();
    const header=element('h3','Коментари · '+task.title);commentSlot.append(header);
    const {data,error}=await supabase.from('david_admin_task_comments')
      .select('id,task_id,author_id,message,created_at').eq('task_id',task.id).order('created_at',{ascending:true}).limit(100);
    if(error){setStatus('Коментарите не са достъпни: '+error.message,true);return;}
    (data||[]).forEach(c=>commentSlot.append(element('div',
      (adminNames.get(c.author_id)||'Admin')+' · '+new Date(c.created_at).toLocaleString('bg-BG')+'\n'+c.message,'comment')));
    const commentForm=element('form');const field=element('textarea');field.required=true;field.maxLength=2500;field.rows=2;
    field.placeholder='Отговор / бележка за задачата';field.setAttribute('aria-label','Нов коментар');
    const send=element('button','Изпрати коментар');send.type='submit';
    commentForm.append(field,send);commentSlot.append(commentForm);
    commentForm.addEventListener('submit',async ev=>{
      ev.preventDefault();const message=field.value.trim();if(!message)return;
      send.disabled=true;
      const {error:postError}=await supabase.from('david_admin_task_comments').insert({task_id:task.id,author_id:user.id,message});
      send.disabled=false;if(postError){setStatus(postError.message,true);return;}await openComments(task);
    });
  }
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const title=form.elements.namedItem('title').value.trim();
    const description=form.elements.namedItem('description').value.trim();
    const priority=form.elements.namedItem('priority').value;
    const assigned_to=form.elements.namedItem('assigned_to').value||null;
    const dueValue=form.elements.namedItem('due_at').value;
    const due_at=dueValue?new Date(dueValue).toISOString():null;
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    const {error}=await supabase.from('david_admin_tasks').insert({
      title,description,priority,assigned_to,due_at,created_by:user.id,source:'human'
    });
    submit.disabled=false;
    if(error){setStatus('Неуспешен запис: '+error.message,true);return;}
    form.reset();setStatus('Задачата е създадена.');await reload();
  });
  $('[data-filter]').addEventListener('change',reload);
  $('[data-reload]').addEventListener('click',reload);
  await reload();
}
