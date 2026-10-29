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

create or replace function public.david_admin_create_company_task(
 p_worker_user_id uuid, p_company_id uuid, p_title text,
 p_description text default '', p_priority text default 'P2',p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_task uuid; v_email text;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if length(trim(coalesce(p_title,''))) not between 4 and 180
 or length(coalesce(p_description,''))>6000 or p_priority not in ('P0','P1','P2','P3')
 or (p_due_at is not null and (p_due_at < now()-interval '5 minutes' or p_due_at > now()+interval '365 days'))
 then raise exception 'Invalid task' using errcode='22023';end if;
 select u.email into v_email from auth.users u
 join public.david_members m on m.user_id=u.id and m.role='worker'
 join public.david_worker_identities i on i.user_id=u.id and i.active=true
 where u.id=p_worker_user_id and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities ai where ai.user_id=u.id and ai.provider='google');
 if v_email is null then raise exception 'Active approved Google operator required' using errcode='42501';end if;
 if not exists(select 1 from public.david_companies where id=p_company_id) then
  raise exception 'Unknown company' using errcode='22023';end if;
 perform public.david_admin_assign_company(p_company_id,p_worker_user_id);
 insert into public.david_admin_tasks(title,description,status,priority,assigned_to,company_id,created_by,source,due_at)
 values(trim(p_title),coalesce(p_description,''),'TODO',p_priority,
 p_worker_user_id,p_company_id,auth.uid(),'human',p_due_at) returning id into v_task;
 insert into public.david_audit_events(actor_id,action,company_id,details)
 values(auth.uid(),'company_task_assigned',p_company_id,
 jsonb_build_object('task_id',v_task,'worker_user_id',p_worker_user_id));
 return jsonb_build_object('ok',true,'task_id',v_task,'company_id',p_company_id,'recipient',v_email);
end $$;
revoke all on function public.david_admin_create_company_task(uuid,uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.david_admin_create_company_task(uuid,uuid,text,text,text,timestamptz) to authenticated;

create or replace function public.david_worker_my_tasks()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tasks jsonb;v_uid uuid:=auth.uid();
begin
 if v_uid is null or not david_internal.david_is_active_member()
 or not exists(select 1 from public.david_members where user_id=v_uid and role='worker')
 then raise exception 'Active operator required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'task_id',t.id,'company_id',t.company_id,'company_name',c.company_name,
 'country',c.country,'title',t.title,'description',t.description,
 'priority',t.priority,'status',t.status,'due_at',t.due_at,'created_at',t.created_at)
 order by t.created_at desc),'[]'::jsonb) into v_tasks
 from public.david_admin_tasks t left join public.david_companies c on c.id=t.company_id
 where t.assigned_to=v_uid and (t.company_id is null or c.assigned_to=v_uid);
 return v_tasks;
end $$;
revoke all on function public.david_worker_my_tasks() from public,anon;
grant execute on function public.david_worker_my_tasks() to authenticated;

create or replace function public.david_worker_save_task_interaction(
 p_task_id uuid,p_outcome text,p_notes text default '',
 p_followup_at timestamptz default null,p_contact_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_task public.david_admin_tasks%rowtype;
 v_company public.david_companies%rowtype;v_id uuid;
begin
 if not david_internal.david_is_active_member()
 or not exists(select 1 from public.david_members m where m.user_id=v_uid and m.role='worker')
 then raise exception 'Active worker required' using errcode='42501';end if;
 if p_outcome not in ('no_answer','callback','followup','interested','declined',
 'contacted','do_not_contact','note') or length(coalesce(p_notes,''))>2000
 or (p_followup_at is not null and (p_followup_at<=now()
 or p_followup_at>now()+interval '365 days'))
 or (p_outcome in ('callback','followup') and p_followup_at is null)
 or (p_outcome<>'note' and p_contact_confirmed is distinct from true)
 then raise exception 'Invalid contact result' using errcode='22023';end if;
 select * into v_task from public.david_admin_tasks where id=p_task_id for update;
 if not found or v_task.assigned_to is distinct from v_uid or v_task.company_id is null
 then raise exception 'Task not owned by operator' using errcode='42501';end if;
 select * into v_company from public.david_companies where id=v_task.company_id for update;
 if not found or v_company.assigned_to is distinct from v_uid then
 raise exception 'Company is not assigned to operator' using errcode='42501';end if;
 if p_outcome<>'note' and (v_company.do_not_call or not v_company.calling_approved
 or v_company.contact_phone !~ '^[+][1-9][0-9]{5,14}$'
 or length(trim(v_company.contact_source))<5) then
 raise exception 'Manual phone contact must be approved' using errcode='42501';end if;
 insert into public.david_company_interactions(task_id,company_id,worker_user_id,outcome,notes,followup_at)
 values(p_task_id,v_company.id,v_uid,p_outcome,coalesce(p_notes,''),p_followup_at)
 returning id into v_id;
 if p_outcome='do_not_contact' then
 update public.david_companies set do_not_call=true,calling_approved=false,updated_at=now()
 where id=v_company.id;end if;
 update public.david_admin_tasks set status='IN_PROGRESS',updated_at=now(),updated_by=v_uid
 where id=p_task_id and status='TODO';
 insert into public.david_audit_events(actor_id,action,company_id,details)
 values(v_uid,'worker_task_contact_saved',v_company.id,
 jsonb_build_object('task_id',p_task_id,'interaction_id',v_id,'outcome',p_outcome));
 return jsonb_build_object('ok',true,'interaction_id',v_id,'company_id',v_company.id,
 'source','operator_self_reported');
end $$;
revoke all on function public.david_worker_save_task_interaction(uuid,text,text,timestamptz,boolean) from public,anon;
grant execute on function public.david_worker_save_task_interaction(uuid,text,text,timestamptz,boolean) to authenticated;
