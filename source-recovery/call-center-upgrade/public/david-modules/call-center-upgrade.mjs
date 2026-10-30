const ADMIN_EMAILS = new Set(['borquitokonsejo@gmail.com', 'soulflame.mitko@gmail.com']);
export function isAdmin(state) {
  return state.role === 'admin' && ADMIN_EMAILS.has(String(state.user?.email || '').toLowerCase());
}
export function callReadiness(config = {}) {
  const checks = [
    ['databaseConfigured', 'Google вход и база данни'],
    ['serverConfigured', 'Сървърна връзка с CRM'],
    ['telephonyConfigured', 'Twilio Voice конфигурация'],
    ['liveCallsEnabled', 'Реални обаждания'],
  ].map(([key, label]) => ({ key, label, ready: config[key] === true }));
  return { ready: checks.every(item => item.ready), checks };
}
export function normalizeDialNumber(value) {
  const number = String(value || '').replace(/[\s().-]/g, '');
  const international = number.startsWith('00') ? '+' + number.slice(2) : /^0\d{9}$/.test(number) ? '+359' + number.slice(1) : number;
  return /^\+[1-9]\d{5,14}$/.test(international) ? international : '';
}
export function assignedNumber(task) {
  const text = [task?.title, task?.instructions].filter(Boolean).join(' ');
  const match = text.match(/\+[1-9]\d{5,14}(?!\d)|(?<!\d)0\d{9}(?!\d)/);
  return normalizeDialNumber(match?.[0]);
}
export function canStartTaskCall(state, value) {
  return callReadiness(state.config).ready && !state.call && !state.taskCallBusy &&
    state.role === 'worker' && !!assignedNumber(state.davidDailyTask) &&
    normalizeDialNumber(value) === assignedNumber(state.davidDailyTask);
}

export function installCallCenterUpgrade(host) {
  const { state: s, escape: esc, toast, render, loadTask, startTaskCall } = host;
  const byId = id => document.getElementById(id);
  let activeAdminTab = 'team';
  let taskLoadSequence = 0;
  let draftNumber = '';
  let rehearsalPlaying = false;
  const tabs = [ ['team', 'Оператори'], ['tasks', 'Задачи'], ['companies', 'Фирми'], ['records', 'Разговори'], ['settings', 'Настройки'] ];
  const go = view => { s.view = view; render(); };
  function readinessHtml() {
    const status = callReadiness(s.config);
    if (!isAdmin(s)) return '<div class="cc-readiness" role="status"><strong>Обажданията очакват активиране от администратор.</strong><p class="tiny" style="margin:8px 0 0">Задачите и скриптовете остават достъпни. Ще можеш да набираш след завършване на настройката.</p></div>';
    return '<div class="cc-readiness" role="status"><strong>' + (status.ready ? 'Готов за реални обаждания' : 'Нужна е настройка преди първия разговор') +
      '</strong><div class="cc-checks">' + status.checks.map(item => '<span class="cc-check ' + (item.ready ? 'ready' : '') + '">' +
      (item.ready ? '✓ ' : '○ ') + esc(item.label) + '</span>').join('') + '</div></div>';
  }
  function settingsPanel() {
    const node = document.createElement('section'); node.className = 'card'; node.id = 'ccSettings';
    node.innerHTML = '<h2>Twilio и състояние на системата</h2>' + readinessHtml() +
      '<p class="muted">Ключовете се добавят само в настройките на съществуващия Vercel проект. Тук се показва готовността, без стойности на ключове.</p>' +
      '<details><summary>Необходими сървърни настройки</summary><div class="panel"><ul>' +
      ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'TWILIO_FROM_NUMBER', 'PUBLIC_ORIGIN'].map(name => '<li><code>' + name + '</code></li>').join('') +
      '</ul><p>Активирай LIVE_CALLS_ENABLED след проверка на номера, Voice URL, callback адресите и лимитите.</p></div></details>' +
      '<p><b>Записи:</b> ' + (s.config?.recordingEnabled ? 'включени в конфигурацията; възпроизвеждането се потвърждава с реален разговор.' : 'изключени в конфигурацията.') +
      '</p><p class="tiny">Готова конфигурация не означава проведен тестов разговор. Транскрипция и AI глас не са потвърдени.</p>' +
      '<button class="btn primary" id="ccRefreshConfig" type="button">Провери отново</button><p id="ccConfigResult" role="status" class="tiny"></p>';
    node.querySelector('#ccRefreshConfig').onclick = async event => {
      event.target.disabled = true;
      try {
        const response = await fetch('/api/config', { cache: 'no-store' });
        if (!response.ok) throw Error('Настройките не могат да се заредят.');
        s.config = await response.json(); render();
      } catch (error) { node.querySelector('#ccConfigResult').textContent = error.message; event.target.disabled = false; }
    };
    return node;
  }
  function organizeAdmin() {
    if (!isAdmin(s) || s.view !== 'admin') return;
    const content = byId('content'); if (!content) return;
    let shell = byId('ccAdminShell');
    if (!shell) {
      shell = document.createElement('section'); shell.id = 'ccAdminShell';
      shell.innerHTML = '<div class="cc-page-head"><div><span class="cc-eyebrow">УПРАВЛЕНИЕ</span><h1>Админ панел</h1><p class="muted">Одобри оператор → възложи задача → проследи резултата.</p></div><span class="tag">Само Борко и Митко</span></div>' +
        '<div class="cc-metrics"><div><strong>' + (s.members || []).filter(m => m.role === 'worker').length + '</strong><span>Оператори в CRM</span></div><div><strong>' + (s.companies || []).length + '</strong><span>Фирми</span></div><div><strong>' + (s.logs || []).length + '</strong><span>Реални обаждания</span></div></div>' +
        '<nav class="cc-tabs" aria-label="Раздели на администраторския панел">' + tabs.map(([id,label]) => '<button type="button" data-admin-tab="' + id + '">' + label + '</button>').join('') + '</nav>';
      for (const [id,label] of tabs) {
        const panel = document.createElement('section'); panel.id = 'ccAdmin-' + id; panel.dataset.adminPanel = id;
        panel.setAttribute('aria-label', label); shell.append(panel);
      }
      content.prepend(shell);
      shell.querySelector('#ccAdmin-settings').append(settingsPanel());
      const records = shell.querySelector('#ccAdmin-records');
      records.innerHTML = '<div class="card"><h2>История на разговорите</h2><p class="muted">Начало до секунда, продължителност и потвърден статус от Twilio.</p><button class="btn primary" type="button" id="ccOpenRecords">Отвори всички разговори</button></div>';
      records.querySelector('button').onclick = () => go('records');
      shell.querySelectorAll('[data-admin-tab]').forEach(button => { button.onclick = () => { activeAdminTab = button.dataset.adminTab; selectTab(); }; });
    }
    // Move live elements, retaining their existing authenticated handlers.
    const move = (node, target) => { if (node && node.parentElement?.id !== 'ccAdmin-' + target) byId('ccAdmin-' + target)?.append(node); };
    move(byId('davidGoogleApprovals'), 'team');
    move(byId('davidMitkoAdminCompanyTask'), 'tasks');
    move(byId('davidAdminAllActivity'), 'records');
    const enroll = byId('enroll'); move(enroll?.closest('.card'), 'team');
    const reload = byId('reloadAdmin'); move(reload?.closest('.card'), 'companies');
    for (const child of [...content.children]) {
      if (child === shell) continue;
      if (child.classList.contains('grid')) {
        for (const card of [...child.children]) move(card, 'settings');
        child.remove();
      } else if (child.matches('h1, p.muted')) child.remove();
      else move(child, 'settings');
    }
    if (!byId('ccAdmin-tasks')?.children.length) {
      const empty = document.createElement('div'); empty.className = 'card'; empty.id = 'ccTasksShortcut';
      empty.innerHTML = '<h2>Задачи на екипа</h2><p class="muted">Възложи инструкции на одобрен оператор от работния център.</p><button type="button" class="btn primary">Управлявай задачите</button>';
      empty.querySelector('button').onclick = () => go('tasks'); byId('ccAdmin-tasks')?.append(empty);
    }
    if (byId('davidMitkoAdminCompanyTask')) byId('ccTasksShortcut')?.remove();
    selectTab();
  }
  function selectTab() {
    const shell = byId('ccAdminShell'); if (!shell) return;
    shell.querySelectorAll('[data-admin-tab]').forEach(button => {
      const active = button.dataset.adminTab === activeAdminTab;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    shell.querySelectorAll('[data-admin-panel]').forEach(panel => { panel.hidden = panel.dataset.adminPanel !== activeAdminTab; });
  }
  function addCallControls() {
    const dock = document.querySelector('.dock .buttons');
    if (!dock || byId('ccMute')) return;
    const mute = document.createElement('button'); mute.id = 'ccMute'; mute.className = 'btn'; mute.type = 'button';
    mute.disabled = !s.call; mute.textContent = s.call?.isMuted?.() ? 'Включи микрофона' : 'Заглуши';
    mute.setAttribute('aria-pressed', String(!!s.call?.isMuted?.()));
    mute.onclick = () => { if (!s.call) return; const next = !s.call.isMuted(); s.call.mute(next); mute.textContent = next ? 'Включи микрофона' : 'Заглуши'; mute.setAttribute('aria-pressed', String(next)); };
    dock.append(mute);
    if (s.call?.sendDigits) {
      const keypad = document.createElement('details'); keypad.className = 'cc-keypad';
      keypad.innerHTML = '<summary>Клавиатура</summary><div class="cc-keypad-grid">' + [...'123456789*0#'].map(digit => '<button type="button" class="btn" data-digit="' + digit + '">' + digit + '</button>').join('') + '</div>';
      keypad.querySelectorAll('button').forEach(button => { button.onclick = () => s.call?.sendDigits(button.dataset.digit); }); dock.append(keypad);
    }
  }
  function renderDesk() {
    const page = byId('content'); if (!page) return;
    const sequence = ++taskLoadSequence;
    const status = callReadiness(s.config);
    page.innerHTML = '<div class="cc-page-head"><div><span class="cc-eyebrow">ОПЕРАТОРСКО МЯСТО</span><h1>Live Call Desk</h1><p class="muted">Задача, телефон и разговор на един екран.</p></div><button class="btn" id="ccBackTasks" type="button">Към задачите</button></div>' +
      (status.ready ? '' : readinessHtml()) + '<div class="cc-desk-grid"><section class="card"><h2>Разговор</h2>' +
      '<label for="deskManualNumber">Служебен телефон</label><input id="deskManualNumber" class="field cc-phone" type="tel" inputmode="tel" placeholder="+359…" autocomplete="off" maxlength="24" value="' + esc(draftNumber) + '">' +
      '<p class="tiny">Разрешен е номерът от назначената ти дневна задача.</p><div class="notice" role="status"><span class="cc-status-dot"></span><strong>' + esc(s.callStatus || (status.ready ? 'Готовност' : 'Очаква Twilio настройка')) + '</strong></div>' +
      '<div class="cc-call-actions"><button id="deskCallStart" class="btn green" type="button" disabled>Започни разговор</button><button id="deskCallEnd" class="btn red" type="button" ' + (s.call ? '' : 'disabled') + '>Приключи</button></div>' +
      '<p id="ccCallHint" class="tiny" role="status">Проверявам задачата…</p><p class="tiny">Запис: ' + (s.config?.recordingEnabled ? 'включен в настройките; изисква потвърждение от Twilio.' : 'изключен.') + '</p></section>' +
      '<section class="card" id="deskWorkerTask" role="status">Зареждам задачата и скрипта…</section></div>' +
      '<div class="card cc-next"><h2>След разговора</h2><p class="muted">Провери потвърдения статус в историята и добави резултата към задачата.</p><button class="btn" id="ccDeskRecords" type="button">История на разговорите</button></div>' +
      '<details class="cc-rehearsal"><summary>Репетиция и тест на глас · без обаждане</summary><div class="panel"><p class="muted">Отделен тестов екран. Репетицията не набира номер и не създава запис на разговор.</p><button class="btn" id="ccRehearsal" type="button">Отвори репетицията</button></div></details>';
    byId('ccBackTasks').onclick = () => go('tasks'); byId('ccDeskRecords').onclick = () => go('records');
    byId('ccRehearsal').onclick = event => {
      if (rehearsalPlaying) { window.speechSynthesis?.cancel(); rehearsalPlaying = false; event.target.textContent = 'Отвори репетицията'; return; }
      if (s.call || s.taskCallBusy) return toast('Приключи активния разговор преди репетиция.');
      const voice = window.speechSynthesis?.getVoices().find(item => /^bg(?:-|$)/i.test(item.lang || ''));
      if (!voice || typeof SpeechSynthesisUtterance === 'undefined') return toast('Няма инсталиран български глас в този браузър. Прегледай скрипта в задачата.');
      const speech = new SpeechSynthesisUtterance(s.davidDailyTask?.call_script || 'Здравейте, обаждам се от SoulFlame по повод цифровия паспорт на батериите.');
      speech.voice = voice; speech.lang = 'bg-BG'; speech.rate = .9;
      rehearsalPlaying = true; event.target.textContent = 'Спри репетицията';
      const done = () => { rehearsalPlaying = false; if (event.target.isConnected) event.target.textContent = 'Отвори репетицията'; };
      speech.onend = done; speech.onerror = done; window.speechSynthesis.speak(speech);
    };
    const input = byId('deskManualNumber');
    input.disabled = !!s.call || !!s.taskCallBusy;
    const update = () => {
      byId('deskCallStart').disabled = !canStartTaskCall(s, input.value);
      byId('ccCallHint').textContent = !status.ready ? 'Администраторът трябва да завърши Twilio настройката.' :
        s.call ? 'Разговорът е активен.' : s.role !== 'worker' ? 'За разговор по фирма отвори одобрена компания от задачите.' :
        !assignedNumber(s.davidDailyTask) ? 'Няма назначен номер за днес.' : normalizeDialNumber(input.value) !== assignedNumber(s.davidDailyTask) ? 'Въведи назначения номер в международен формат.' : 'Номерът съвпада със задачата. Сървърът проверява достъпа преди набиране.';
    };
    input.oninput = () => { draftNumber = input.value; update(); };
    byId('deskCallStart').onclick = () => {
      if (!canStartTaskCall(s, input.value)) return;
      window.speechSynthesis?.cancel(); rehearsalPlaying = false;
      draftNumber = normalizeDialNumber(input.value); input.value = draftNumber; s.davidCallMode = 'real'; return startTaskCall();
    };
    byId('deskCallEnd').onclick = () => s.call?.disconnect();
    const controls = document.createElement('div'); controls.className = 'dock'; controls.innerHTML = '<div><strong>Live Call Desk</strong><div class="tiny">' + esc(s.callStatus || 'Няма активен разговор') + '</div></div><div class="buttons"></div>';
    if (s.call) page.append(controls);
    addCallControls(); update();
    Promise.resolve(loadTask()).then(() => {
      if (sequence !== taskLoadSequence || s.view !== 'desk' || !input.isConnected) return;
      if (!draftNumber) { draftNumber = assignedNumber(s.davidDailyTask); input.value = draftNumber; }
      update();
    }).catch(error => { if (input.isConnected) toast(error.message); });
  }
  function afterRender() {
    const root = byId('root'); if (!root) return;
    root.dataset.role = isAdmin(s) ? 'admin' : s.role === 'worker' ? 'worker' : 'pending';
    document.querySelectorAll('[data-nav="admin"]').forEach(button => { button.hidden = !isAdmin(s); });
    const labels = { tasks: 'Задачи', mycompanies: 'Моите фирми', desk: 'Live Call Desk', records: 'Разговори', general: 'Информация', profile: 'Моят профил', support: 'Поддръжка', admin: 'Админ панел' };
    document.querySelectorAll('[data-nav]').forEach(button => { if (labels[button.dataset.nav]) button.textContent = labels[button.dataset.nav]; });
    const top = document.querySelector('.top');
    if (top) {
      const chips = top.querySelectorAll('.chip');
      if (chips[0]) chips[0].textContent = isAdmin(s) ? 'Администратор' : 'Оператор';
      if (chips[1]) { chips[1].textContent = callReadiness(s.config).ready ? 'Обаждания: готова конфигурация' : 'Обаждания: нужна настройка'; chips[1].classList.toggle('green', callReadiness(s.config).ready); chips[1].classList.toggle('amber', !callReadiness(s.config).ready); }
    }
    if (s.view === 'admin' && !isAdmin(s)) { go('tasks'); return; }
    organizeAdmin();
    if (s.view === 'desk') addCallControls();
    if (s.view === 'tasks') {
      const heading = byId('content')?.querySelector('h1'); if (heading) heading.textContent = isAdmin(s) ? 'Задачи на екипа' : 'Моите задачи';
    }
  }
  // Observe only late admin additions, not the full app or user input.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (s.view !== 'admin' || scheduled) return;
    scheduled = true; queueMicrotask(() => { scheduled = false; organizeAdmin(); });
  });
  const root = byId('root'); if (root) observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); window.speechSynthesis?.cancel(); }, { once: true });
  return { afterRender, renderDesk };
}
