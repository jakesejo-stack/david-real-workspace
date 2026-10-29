export function workerLabel(worker) {
  const email = String(worker.email || '').trim().toLowerCase();
  const name = String(worker.name || '').trim();
  return name ? name + ' — ' + email : email;
}
