-- PR 2 / migration 016: Google operator application, BEFORE admin approval.
-- Do not apply to production before source recovery and rollback-tested preview.
create table if not exists public.david_operator_applications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 2 and 120),
 country text not null check(length(trim(country)) between 2 and 80),
 languages text[] not null check(cardinality(languages) between 1 and 12),
 phone text not null check(phone ~ '^[+][1-9][0-9]{5,14}$'),
 status text not null default 'submitted' check(status in ('submitted','approved','rejected')),
 submitted_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.david_operator_applications enable row level security;
revoke all on public.david_operator_applications from public, anon, authenticated;
grant select on public.david_operator_applications to authenticated;
drop policy if exists david_operator_applications_self_admin_read on public.david_operator_applications;
create policy david_operator_applications_self_admin_read on public.david_operator_applications
 for select to authenticated using(user_id=(select auth.uid()) or david_internal.david_is_admin());

create or replace function public.david_operator_submit_application(
 p_full_name text, p_country text, p_languages text[], p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_email text; v_name text:=trim(coalesce(p_full_name,''));
 v_country text:=trim(coalesce(p_country,'')); v_phone text:=trim(coalesce(p_phone,''));
 v_languages text[];
begin
 select lower(u.email) into v_email from auth.users u where u.id=v_uid
 and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if v_email is null then raise exception 'Verified Google login required' using errcode='42501'; end if;
 if exists(select 1 from public.david_members where user_id=v_uid and role='admin') then
   raise exception 'Admin does not apply as worker' using errcode='42501'; end if;
 if exists(select 1 from public.david_google_access_requests where user_id=v_uid and status in ('approved','rejected')) then
   raise exception 'Application already reviewed; contact admin' using errcode='42501'; end if;
 select array_agg(distinct trim(x)) into v_languages
 from unnest(coalesce(p_languages,array[]::text[])) x where length(trim(x)) between 2 and 40;
 if length(v_name) not between 2 and 120 or length(v_country) not between 2 and 80
 or v_phone !~ '^[+][1-9][0-9]{5,14}$'
 or coalesce(cardinality(v_languages),0) not between 1 and 12
 or exists(select 1 from unnest(coalesce(p_languages,array[]::text[])) x
    where trim(x)='' or length(trim(x))>40)
 then raise exception 'Complete name, country, languages and international phone' using errcode='22023'; end if;
 insert into public.david_operator_applications(user_id,full_name,country,languages,phone)
 values(v_uid,v_name,v_country,v_languages,v_phone)
 on conflict(user_id) do update set full_name=excluded.full_name,country=excluded.country,
 languages=excluded.languages,phone=excluded.phone,status='submitted',updated_at=now();
 insert into public.david_google_access_requests(user_id,email,display_name,status)
 values(v_uid,v_email,v_name,'pending')
 on conflict(user_id) do update set display_name=excluded.display_name,last_seen_at=now()
 where public.david_google_access_requests.status='pending';
 insert into public.david_audit_events(actor_id,action,details)
 values(v_uid,'operator_application_submitted',jsonb_build_object('profile_complete',true));
 return jsonb_build_object('ok',true,'status','pending','email',v_email);
end $$;
revoke all on function public.david_operator_submit_application(text,text,text[],text) from public,anon;
grant execute on function public.david_operator_submit_application(text,text,text[],text) to authenticated;

-- Every new worker activation, including old invite workflow, requires a submitted profile.
create or replace function david_internal.david_require_operator_application()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active=true and (tg_op='INSERT' or old.active is distinct from true)
    and exists(select 1 from public.david_members m where m.user_id=new.user_id and m.role='worker')
    and not exists(select 1 from public.david_operator_applications a
       where a.user_id=new.user_id and a.status in ('submitted','approved'))
 then raise exception 'Complete Google operator application before admin approval' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists david_operator_application_activation_gate on public.david_worker_identities;
create trigger david_operator_application_activation_gate before insert or update of active
 on public.david_worker_identities for each row execute function david_internal.david_require_operator_application();

-- Only submitted candidates are visible in the Admin approval queue.
create or replace function public.david_admin_google_access_requests()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',r.user_id,'email',r.email,'name',a.full_name,'country',a.country,
  'languages',a.languages,'phone',a.phone,'status',r.status,
  'operator_kind',r.operator_kind,'requested_at',r.requested_at,
  'reviewed_at',r.reviewed_at
 ) order by r.requested_at desc),'[]'::jsonb) into v_items
 from public.david_google_access_requests r
 join public.david_operator_applications a on a.user_id=r.user_id
 where a.status in ('submitted','approved') and r.status in ('pending','approved');
 return jsonb_build_object('ok',true,'requests',v_items);
end $$;
revoke all on function public.david_admin_google_access_requests() from public,anon;
grant execute on function public.david_admin_google_access_requests() to authenticated;
