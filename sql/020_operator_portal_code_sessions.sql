-- DPP Operator Portal V1, separate from MITKO's inaccessible DAVID OS /work route.
-- Uses EXISTING 12-minute DAVID link code as a single-use activation.
-- A redeemed code cannot also be redeemed by the external DAVID OS bridge.
-- Requires same VERIFIED Google identity that generated the link code.
-- Sessions are server-authorized with DB RLS; no browser-assigned roles, no fake calls.

create table if not exists public.david_operator_portal_attempts (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 attempted_at timestamptz not null default now(),
 result text not null check (result in ('invalid','accepted','rate_limited'))
);
create index if not exists david_portal_attempts_user_time on public.david_operator_portal_attempts(user_id,attempted_at desc);
alter table public.david_operator_portal_attempts enable row level security;
revoke all on public.david_operator_portal_attempts from public,anon,authenticated;

create table if not exists public.david_operator_portal_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 worker_id uuid not null references public.david_worker_identities(worker_id),
 code_id uuid not null unique references public.david_link_codes(id),
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '4 hours'),
 revoked_at timestamptz
);
create index if not exists david_portal_sessions_user_valid on public.david_operator_portal_sessions(user_id,expires_at desc);
alter table public.david_operator_portal_sessions enable row level security;
revoke all on public.david_operator_portal_sessions from public,anon,authenticated;

create or replace function public.david_operator_portal_activate(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_hash text;
  v_worker public.david_worker_identities%rowtype;
  v_link public.david_link_codes%rowtype;
  v_count integer;
  v_session uuid;
  v_role text;
begin
 if v_uid is null or not exists (
   select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null
     and exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
 ) then raise exception 'Verified Google account required' using errcode='42501'; end if;
 select wi.* into v_worker
 from public.david_worker_identities wi
 join public.david_members m on m.user_id=wi.user_id
 where wi.user_id=v_uid and wi.active=true and m.role in ('admin','worker') for update of wi;
 if not found then raise exception 'Approved active DPP member required' using errcode='42501'; end if;
 select role into v_role from public.david_members where user_id=v_uid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_uid::text));
 select count(*) into v_count from public.david_operator_portal_attempts
   where user_id=v_uid and attempted_at>now()-interval '15 minutes' and result='invalid';
 if v_count>=5 then
   insert into public.david_operator_portal_attempts(user_id,result) values (v_uid,'rate_limited');
   return pg_catalog.jsonb_build_object('ok',false,'reason','rate_limited');
 end if;
 if v_code !~ '^#[A-HJ-NP-Z2-9]{12}!$' then
   insert into public.david_operator_portal_attempts(user_id,result) values (v_uid,'invalid');
   return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
 end if;
 v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_code,'UTF8')),'hex');
 select * into v_link from public.david_link_codes
 where worker_id=v_worker.worker_id and code_hash=v_hash for update;
 if not found or v_link.status<>'issued' or v_link.expires_at<=now() then
   insert into public.david_operator_portal_attempts(user_id,result) values (v_uid,'invalid');
   return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
 end if;
 -- Single-use. The DAVID OS bridge cannot subsequently redeem this code.
 update public.david_link_codes set status='redeemed',redeemed_at=now() where id=v_link.id;
 -- Previous portal sessions are invalidated to ensure one active session.
 update public.david_operator_portal_sessions set revoked_at=now()
 where user_id=v_uid and revoked_at is null;
 insert into public.david_operator_portal_sessions(user_id,worker_id,code_id)
 values(v_uid,v_worker.worker_id,v_link.id) returning id into v_session;
 insert into public.david_operator_portal_attempts(user_id,result) values (v_uid,'accepted');
 insert into public.david_audit_events(actor_id,action,details)
 values(v_uid,'operator_portal_code_activated',pg_catalog.jsonb_build_object('worker_id',v_worker.worker_id,'session_id',v_session));
 return pg_catalog.jsonb_build_object('ok',true,'role',v_role,'expires_in_minutes',240);
end;
$fn$;
revoke all on function public.david_operator_portal_activate(text) from public,anon;
grant execute on function public.david_operator_portal_activate(text) to authenticated;

create or replace function public.david_operator_portal_snapshot()
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_worker public.david_worker_identities%rowtype;
 v_role text;
 v_session public.david_operator_portal_sessions%rowtype;
 v_companies jsonb;
begin
 if v_uid is null then return pg_catalog.jsonb_build_object('active',false,'reason','login_required');end if;
 select wi.* into v_worker
 from public.david_worker_identities wi
 join public.david_members m on m.user_id=wi.user_id
 join auth.users u on u.id=wi.user_id
 where wi.user_id=v_uid and wi.active=true and m.role in ('worker','admin')
 and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if not found then return pg_catalog.jsonb_build_object('active',false,'reason','not_approved');end if;
 select * into v_session from public.david_operator_portal_sessions
 where user_id=v_uid and worker_id=v_worker.worker_id and revoked_at is null and expires_at>now()
 order by issued_at desc limit 1;
 if not found then return pg_catalog.jsonb_build_object('active',false,'reason','code_required');end if;
 select role into v_role from public.david_members where user_id=v_uid;
 -- Never expose unassigned pool or another worker's companies even if a legacy RLS rule does.
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'id',c.id,'name',c.company_name,'country',c.country,'sector',c.sector,
 'calling_approved',c.calling_approved,'do_not_call',c.do_not_call,
 'phone',case when c.calling_approved and not c.do_not_call
   then c.contact_phone else null end
 ) order by c.company_name),'[]'::jsonb) into v_companies
 from (select * from public.david_companies where assigned_to=v_uid order by company_name limit 100) c;
 return pg_catalog.jsonb_build_object(
 'active',true,'role',v_role,'worker_id',v_worker.worker_id,
 'expires_at',v_session.expires_at,'companies',v_companies);
end;
$fn$;
revoke all on function public.david_operator_portal_snapshot() from public,anon;
grant execute on function public.david_operator_portal_snapshot() to authenticated;

create or replace function public.david_operator_portal_logout()
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare v_uid uuid:=(select auth.uid());
begin
 if v_uid is null then raise exception 'Google login required' using errcode='42501';end if;
 update public.david_operator_portal_sessions
 set revoked_at=now() where user_id=v_uid and revoked_at is null;
 return pg_catalog.jsonb_build_object('ok',true);
end;
$fn$;
revoke all on function public.david_operator_portal_logout() from public,anon;
grant execute on function public.david_operator_portal_logout() to authenticated;
