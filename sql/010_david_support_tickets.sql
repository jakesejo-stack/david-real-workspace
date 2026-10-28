-- P5 scoped internal support inbox. Source: applied DAVID Call Desk schema.
create table if not exists public.david_support_tickets (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.david_companies(id),
 organization_id uuid not null references public.david_organizations(id),
 external_org_id text, external_ticket_id text,
 source_system text not null default 'operator' check(source_system in ('operator','soulflame_twins','dpp_autopilot')),
 category text not null default 'other' check(category in ('qr','passport','document','account','bug','payment','integration','other')),
 severity text not null default 'S3' check(severity in ('S1','S2','S3','S4')),
 status text not null default 'NEW' check(status in ('NEW','TRIAGED','ASSIGNED','IN_PROGRESS','NEEDS_INFO','FIX_IN_REVIEW','VERIFIED','CLOSED','REOPENED')),
 title text not null check(length(title) between 4 and 200),description text not null default '',
 assigned_worker_id uuid references public.david_worker_identities(worker_id),
 created_by uuid references auth.users(id), github_issue_url text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),closed_at timestamptz
);
create unique index if not exists david_support_external_unique on public.david_support_tickets(source_system,external_ticket_id) where external_ticket_id is not null;
create index if not exists david_support_status_idx on public.david_support_tickets(status,created_at desc);
create index if not exists david_support_worker_idx on public.david_support_tickets(assigned_worker_id,status);
alter table public.david_support_tickets enable row level security;
revoke all on public.david_support_tickets from anon,authenticated;
grant select on public.david_support_tickets to authenticated;
drop policy if exists david_support_admin_select on public.david_support_tickets;
create policy david_support_admin_select on public.david_support_tickets for select to authenticated using(david_internal.david_is_admin());
drop policy if exists david_support_worker_select on public.david_support_tickets;
create policy david_support_worker_select on public.david_support_tickets for select to authenticated using(david_internal.david_is_active_member() and assigned_worker_id in (select worker_id from public.david_worker_identities where user_id=(select auth.uid()) and organization_id=david_support_tickets.organization_id and active=true));
create table if not exists public.david_support_ticket_events(id bigint generated always as identity primary key,ticket_id uuid not null references public.david_support_tickets(id) on delete cascade,actor_id uuid references auth.users(id),action text not null,note text not null default '',created_at timestamptz not null default now());
alter table public.david_support_ticket_events enable row level security;
revoke all on public.david_support_ticket_events from anon,authenticated;
grant select on public.david_support_ticket_events to authenticated;
drop policy if exists david_support_events_scoped on public.david_support_ticket_events;
create policy david_support_events_scoped on public.david_support_ticket_events for select to authenticated using(exists(select 1 from public.david_support_tickets t where t.id=ticket_id));

CREATE OR REPLACE FUNCTION public.david_admin_create_ticket(p_company_id uuid, p_title text, p_description text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;v_id uuid;
begin
 if not david_internal.david_is_admin() then raise exception 'Forbidden' using errcode='42501';end if;
 if length(trim(p_title)) not between 4 and 200 or length(coalesce(p_description,''))>6000 then
 raise exception 'Invalid input';end if;
 if not exists(select 1 from public.david_companies where id=p_company_id) then
 raise exception 'Unknown company';end if;
 select id into v_org from public.david_organizations where slug='soulflame';
 insert into public.david_support_tickets(company_id,organization_id,title,description,created_by)
 values(p_company_id,v_org,trim(p_title),coalesce(p_description,''),auth.uid()) returning id into v_id;
 insert into public.david_support_ticket_events(ticket_id,actor_id,action)
 values(v_id,auth.uid(),'CREATED');
 return jsonb_build_object('ok',true,'ticket_id',v_id,'status','NEW');
end; $function$
;
revoke all on function public.david_admin_create_ticket(uuid,text,text) from public,anon;
grant execute on function public.david_admin_create_ticket(uuid,text,text) to authenticated;
