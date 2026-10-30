-- Disposable schema representing ONLY dependencies needed by SQL 016-018.
-- This is NOT a dump of production. Never connect this job to Supabase/Twilio.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema david_internal;
grant usage on schema auth,david_internal to authenticated;
create or replace function auth.uid() returns uuid
 language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 $$;
create table auth.users (
 id uuid primary key, email text, email_confirmed_at timestamptz
);
create table auth.identities (user_id uuid references auth.users(id), provider text);
create table public.david_members (
 user_id uuid primary key references auth.users(id),
 role text not null, display_name text
);
create table public.david_google_access_requests (
 user_id uuid primary key references auth.users(id),
 email text, display_name text, status text not null default 'pending',
 operator_kind text, requested_at timestamptz not null default now(),
 reviewed_at timestamptz, last_seen_at timestamptz not null default now()
);
create table public.david_worker_identities (
 user_id uuid primary key references auth.users(id), active boolean default false
);
create table public.david_companies (
 id uuid primary key default gen_random_uuid(),
 company_name text, country text, city text, sector text,
 research_notes text, contact_name text, contact_email text,
 contact_phone text, contact_source text default '',
 assigned_to uuid, do_not_call boolean not null default false,
 calling_approved boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.david_admin_tasks (
 id uuid primary key default gen_random_uuid(),
 title text, description text, status text, priority text,
 assigned_to uuid, company_id uuid,
 created_by uuid, source text, due_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), updated_by uuid
);
create table public.david_audit_events (
 actor_id uuid, action text, company_id uuid, details jsonb
);
create or replace function david_internal.david_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.david_members m
 where m.user_id=auth.uid() and m.role='admin')
$$;
create or replace function david_internal.david_is_active_member()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.david_members m
 left join public.david_worker_identities wi on wi.user_id=m.user_id
 where m.user_id=auth.uid()
 and (m.role='admin' or (m.role='worker' and wi.active=true)))
$$;
create or replace function public.david_admin_assign_company(
 p_company_id uuid, p_worker_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not david_internal.david_is_admin() then
   raise exception 'Admin required' using errcode='42501';
 end if;
 update public.david_companies set assigned_to=p_worker_user_id where id=p_company_id;
 return jsonb_build_object('ok',true);
end $$;
