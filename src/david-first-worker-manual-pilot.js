/**
 * P12 minimal worker dashboard (isolated module for ORIGINAL Vite source).
 * Does not make calls, create Twilio CallSids, or record audio.
 * Requires SQL 015 + a verified Supabase Auth Google session.
 * The calling approval and assignment are enforced a second time by RPC.
 */
export async function mountFirstDppWorkerPilot(container, supabase) {
  if (!container || !supabase) throw new Error('Container and Supabase client required');
  const make = (tag, content = '', className = '') => {
    const node = document.createElement(tag);
    if (content) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const style = make('style');
  style.textContent = [
    '.dpp-first-worker{font:inherit;max-width:950px;margin:auto;padding:16px}',
    '.dpp-first-worker .pilot-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}',
    '.dpp-first-worker .pilot-card{border:1px solid #59616f;border-radius:14px;padding:16px;display:grid;gap:10px}',
    '.dpp-first-worker .pilot-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '.dpp-first-worker select,.dpp-first-worker textarea,.dpp-first-worker input{max-width:100%;min-width:0;padding:10px;border:1px solid #677388;border-radius:8px;background:transparent;color:inherit}',
    '.dpp-first-worker select option{color:#111;background:#fff}',
    '.dpp-first-worker textarea{width:100%;min-height:75px}',
    '.dpp-first-worker button,.dpp-first-worker a.pilot-phone{padding:10px 14px;border:1px solid #8193b1;border-radius:9px;cursor:pointer;color:inherit;text-decoration:none;background:transparent}',
    '.dpp-first-worker button:disabled{opacity:.45;cursor:not-allowed}',
    '.dpp-first-worker .pilot-muted{opacity:.75;font-size:.92em}',
    '@media(max-width:600px){.dpp-first-worker{padding:10px}.dpp-first-worker .pilot-card{padding:12px}}'
  ].join('');
  const root = make('section', '', 'dpp-first-worker');
  const title = make('h2', 'МОИТЕ ФИРМИ · DPP оператор');
  const info = make('p','Проверка на служебната сесия…','pilot-muted');
  const grid = make('div','','pilot-grid');
  root.append(style,title,info,grid);
  container.replaceChildren(root);

  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authError || !user) {
    info.textContent = 'Влез през служебния Google профил в DAVID Call Desk.';
    return root;
  }
  const { data: membership, error: memberError } = await supabase
    .from('david_members').select('role').eq('user_id',user.id).maybeSingle();
  if (memberError || membership?.role !== 'worker') {
    info.textContent = 'Нямаш одобрена операторска роля. Администратор трябва да одобри поканата.';
    return root;
  }
  const { data: identity, error: identityError } = await supabase
    .from('david_worker_identities').select('active').eq('user_id',user.id).maybeSingle();
  if (identityError || identity?.active !== true) {
    info.textContent = 'Операторът не е активен. Няма достъп до CRM.';
    return root;
  }

  async function refresh() {
    grid.replaceChildren();
    const { data: companies, error } = await supabase
      .from('david_companies')
      .select('id,company_name,country,sector,contact_phone,task,assigned_to,calling_approved,do_not_call')
      .eq('assigned_to',user.id).order('company_name');
    if (error) {
      info.textContent = 'Зареждането е отказано: ' + error.message;
      return;
    }
    // Defense in depth: never render unassigned rows if a server query changes.
    const own = (companies || []).filter(c => c.assigned_to === user.id);
    info.textContent = own.length
      ? 'Назначени фирми: ' + own.length + '. Ръчните обаждания не са Twilio обаждания.'
      : 'Нямаш назначени фирми. Помоли Admin да назначи 2 тестови фирми.';
    for (const company of own) {
      const card = make('article','','pilot-card');
      const h = make('h3',company.company_name);
      const meta = make('p',(company.country || '') + ' · ' + (company.sector || ''),'pilot-muted');
      const task = make('p','Задача: ' + (company.task || 'Няма зададена задача'));
      const allowed = company.calling_approved === true && company.do_not_call !== true
        && /^[+][1-9][0-9]{5,14}$/.test(company.contact_phone || '');
      const access = make('p',allowed
        ? 'Разрешен служебен номер. Обаждането е ръчно.'
        : 'Не е разрешено набиране. Нужна е Admin проверка.',
        'pilot-muted');
      card.append(h,meta,task,access);
      if (allowed) {
        const phone = make('a',company.contact_phone,'pilot-phone');
        phone.href='tel:' + company.contact_phone;
        phone.setAttribute('aria-label','Набери ръчно ' + company.company_name);
        card.append(phone);
      }
      const select=make('select');
      select.setAttribute('aria-label','Резултат за '+company.company_name);
      for (const [value,label] of [
        ['no_answer','Без отговор'],['declined','Отказ'],['interested','Интерес'],
        ['callback','Обратно обаждане'],['opt_out','Без повече контакт']
      ]) {
        const opt=make('option',label);opt.value=value;select.append(opt);
      }
      const notes=make('textarea');notes.maxLength=2000;
      notes.placeholder='Кратка служебна бележка (без ненужни лични данни)';
      const follow=make('input');follow.type='datetime-local';follow.setAttribute('aria-label','Следващо обаждане');
      const followLabel=make('label','Следваща задача (при обратно обаждане)');
      const save=make('button','Запиши резултата');
      save.type='button';save.disabled=!allowed;
      const result=make('p','','pilot-muted');
      let pendingId=null;
      async function submit(){
        if (!allowed) return;
        if (!pendingId) pendingId=crypto.randomUUID();
        save.disabled=true;result.textContent='Записване…';
        let next=null;
        if(follow.value){
          const d=new Date(follow.value);
          if(Number.isNaN(d.getTime())){
            result.textContent='Невалидна дата.';save.disabled=false;return;
          }
          next=d.toISOString();
        }
        const {data,error}=await supabase.rpc('david_worker_log_manual_activity',{
          p_company_id:company.id,p_result:select.value,p_notes:notes.value,
          p_next_followup_at:next,p_client_action_id:pendingId
        });
        if(error || data?.ok!==true){
          result.textContent='Не е записано: '+(error?.message || 'Неуспешен отговор')+'. Безопасно е да опиташ пак.';
          save.disabled=false;return;
        }
        pendingId=null;
        result.textContent='Записано в CRM'+(data.duplicate?' (повторението е пропуснато)':'')+'.';
        notes.value='';follow.value='';save.disabled=false;
        if(select.value==='opt_out') {
          access.textContent='Без повече контакт. Фирмата е маркирана do-not-call.';
          save.disabled=true;
        }
      }
      save.addEventListener('click',submit);
      card.append(select,notes,followLabel,follow,save,result);
      grid.append(card);
    }
  }
  await refresh();
  return root;
}
