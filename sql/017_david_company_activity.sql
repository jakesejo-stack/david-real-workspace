-- New operator task workflow. Apply only in tested preview, not directly to production.
alter table public.david_admin_tasks add column if not exists company_id uuid references public.david_companies(id) on delete set null;
create table if not exists public.david_company_interactions (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.david_admin_tasks(id),
 company_id uuid not null references public.david_companies(id),
 worker_user_id uuid not null references auth.users(id),
 outcome text not null check(outcome in ('no_answer','callback','followup','interested','declined','contacted','do_not_contact','note')),
 notes text not null default '' check(length(notes)<=2000),
 followup_at timestamptz,
 source text not null default 'operator_self_reported',
 created_at timestamptz not null default now()
);
create index if not exists david_company_interactions_worker_idx on public.david_company_interactions(worker_user_id,created_at desc);
create index if not exists david_company_interactions_company_idx on public.david_company_interactions(company_id,created_at desc);
alter table public.david_company_interactions enable row level security;
revoke all on public.david_company_interactions from public,anon,authenticated;
grant select on public.david_company_interactions to authenticated;
create policy david_company_interactions_admin_self_read on public.david_company_interactions for select to authenticated using (
 david_internal.david_is_active_member() and (david_internal.david_is_admin() or worker_user_id=(select auth.uid()))
);
