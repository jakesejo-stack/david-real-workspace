export function workerLabel(worker) {
  const email = String(worker.email || '').trim().toLowerCase();
  const name = String(worker.name || '').trim();
  return name ? name + ' — ' + email : email;
}

export async function getApprovedWorkers(db) {
  const response = await db.rpc('david_admin_daily_workers');
  if (response.error) throw response.error;
  if (!Array.isArray(response.data)) throw new Error('Невалиден отговор за оператори');
  const used = new Set();
  return response.data.filter(w => {
    if (!w || !w.email || !w.user_id || used.has(w.user_id)) return false;
    used.add(w.user_id);
    return true;
  }).map(w => ({ id: w.user_id, email: w.email, name: w.name,
    label: workerLabel(w), languages: w.languages || [] }));
}

export function fillWorkerSelect(select, workers, chosenId = '') {
  select.replaceChildren();
  const doc = select.ownerDocument;
  const empty = doc.createElement('option');
  empty.value = '';
  empty.textContent = workers.length ? 'Избери оператор по Gmail' : 'Няма активни оператори';
  select.append(empty);
  for (const w of workers) {
    const option = doc.createElement('option');
    option.value = w.id;
    option.textContent = w.label;
    option.selected = w.id === chosenId;
    select.append(option);
  }
  select.disabled = workers.length === 0;
}

export async function createWorkerTask(db, workers, chosenId, task) {
  const selected = workers.find(w => w.id === chosenId);
  if (!selected) throw new Error('Операторът не е в списъка с одобрени');
  const { data, error } = await db.rpc('david_admin_create_assignment', {
    p_worker_email: selected.email,
    p_title: task.title,
    p_description: task.description || '',
    p_priority: task.priority || 'P2',
    p_due_at: task.dueAt || null,
    p_source: 'human'
  });
  if (error) throw error;
  if (!data || data.ok !== true) throw new Error('Задачата не е потвърдена');
  return { ...data, recipient: selected.email };
}

export async function assignCompany(db, workers, companyId, chosenId) {
  if (chosenId && !workers.find(w => w.id === chosenId)) {
    throw new Error('Неактивен или неодобрен оператор');
  }
  const { data, error } = await db.rpc('david_admin_assign_company', {
    p_company_id: companyId, p_worker_user_id: chosenId || null
  });
  if (error) throw error;
  if (data?.ok !== true) throw new Error('Назначението не е потвърдено');
  return data;
}
