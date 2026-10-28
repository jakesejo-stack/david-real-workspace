-- DAVID admin task exchange for human admins and connected GPT agents.
-- This deliberately does not grant the agent a service_role key or bypass user-based RLS.
create table if not exists public.david_admin_tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null constraint david_admin_task_title_len check (char_length(btrim(title)) between 4 and 180),
 description text not null default '' constraint david_admin_task_description_len check (char_length(description)<=6000),
 status text not null default 'TODO' constraint david_admin_task_status_check check (status in ('TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE')),
 priority text not null default 'P2' constraint david_admin_task_priority_check check (priority in ('P0','P1','P2','P3')),
 assigned_to uuid references auth.users(id) on delete set null,
 created_by uuid not null references auth.users(id) on delete restrict,
 updated_by uuid references auth.users(id) on delete set null,
 source text not null default 'human' constraint david_admin_task_source_check check (source in ('human','mitko_gpt','david_gpt')),
 external_request_id uuid unique,
 due_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists david_admin_tasks_assignee_status_idx on public.david_admin_tasks(assigned_to,status);
create index if not exists david_admin_tasks_created_idx on public.david_admin_tasks(created_at desc);
alter table public.david_admin_tasks enable row level security;
revoke all on table public.david_admin_tasks from public,anon,authenticated;
grant select,insert,update on table public.david_admin_tasks to authenticated;
drop policy if exists david_admin_tasks_read on public.david_admin_tasks;
create policy david_admin_tasks_read on public.david_admin_tasks for select to authenticated using ((select david_internal.david_is_admin()));
drop policy if exists david_admin_tasks_create on public.david_admin_tasks;
create policy david_admin_tasks_create on public.david_admin_tasks for insert to authenticated
 with check ((select david_internal.david_is_admin()) and created_by=(select auth.uid()) and updated_by is null);
drop policy if exists david_admin_tasks_update on public.david_admin_tasks;
create policy david_admin_tasks_update on public.david_admin_tasks for update to authenticated
 using ((select david_internal.david_is_admin())) with check ((select david_internal.david_is_admin()));
create or replace function david_internal.david_touch_admin_task()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
 or new.external_request_id is distinct from old.external_request_id
 then raise exception 'Immutable task attribution' using errcode='42501';end if;
 new.updated_at := now();
 new.updated_by := (select auth.uid());
 return new;
end; $$;
drop trigger if exists david_admin_task_touch on public.david_admin_tasks;
create trigger david_admin_task_touch before update on public.david_admin_tasks
 for each row execute function david_internal.david_touch_admin_task();

create table if not exists public.david_admin_task_comments (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.david_admin_tasks(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete restrict,
 message text not null constraint david_admin_task_comment_len check (char_length(btrim(message)) between 1 and 2500),
 created_at timestamptz not null default now()
);
create index if not exists david_admin_comments_task_time_idx on public.david_admin_task_comments(task_id,created_at);
alter table public.david_admin_task_comments enable row level security;
revoke all on table public.david_admin_task_comments from public,anon,authenticated;
grant select,insert on table public.david_admin_task_comments to authenticated;
drop policy if exists david_admin_comments_read on public.david_admin_task_comments;
create policy david_admin_comments_read on public.david_admin_task_comments for select to authenticated
 using ((select david_internal.david_is_admin()));
drop policy if exists david_admin_comments_create on public.david_admin_task_comments;
create policy david_admin_comments_create on public.david_admin_task_comments for insert to authenticated
 with check ((select david_internal.david_is_admin()) and author_id=(select auth.uid()));
