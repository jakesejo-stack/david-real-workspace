
create policy david_worker_identity_admin_read on public.david_worker_identities
for select to authenticated
using (david_internal.david_is_admin());
