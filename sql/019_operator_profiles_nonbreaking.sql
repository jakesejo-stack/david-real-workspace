-- Non-breaking operator registration on the existing DAVID Call Desk Supabase.
-- No legacy trigger change, no existing worker/role modifications.
create table if not exists public.david_operator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  country text not null check (length(btrim(country)) between 2 and 80),
  languages text[] not null check (cardinality(languages) between 1 and 12),
  phone text not null check (phone ~ '^[+][1-9][0-9]{5,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.david_operator_profiles enable row level security;
revoke all on public.david_operator_profiles from public, anon, authenticated;
grant select on public.david_operator_profiles to authenticated;
drop policy if exists david_operator_profiles_self_and_owner_read on public.david_operator_profiles;
create policy david_operator_profiles_self_and_owner_read
 on public.david_operator_profiles for select to authenticated using (
 user_id=(select auth.uid()) or (select david_internal.david_is_admin())
);
create or replace function public.david_operator_submit_profile(
 p_full_name text, p_country text, p_languages text[], p_phone text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := (select auth.uid()); v_email text; v_name text:=btrim(coalesce(p_full_name,''));
 v_country text:=btrim(coalesce(p_country,'')); v_phone text:=btrim(coalesce(p_phone,''));
 v_languages text[];v_status text;
begin
 select lower(btrim(u.email)) into v_email from auth.users u
 where u.id=v_uid and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if v_email is null then
  raise exception 'Verified Google account required' using errcode='42501';
 end if;
 if v_email in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com')
    or exists(select 1 from public.david_members m where m.user_id=v_uid and m.role='admin') then
  raise exception 'Owner account cannot apply as operator' using errcode='42501';
 end if;
 if exists(select 1 from public.david_google_access_requests r
   where r.user_id=v_uid and r.status='rejected') then
  raise exception 'Application has already been rejected' using errcode='42501';
 end if;
 select array_agg(distinct btrim(x)) into v_languages
 from unnest(coalesce(p_languages,array[]::text[])) x
 where length(btrim(x)) between 2 and 40;
 if length(v_name) not between 2 and 120 or length(v_country) not between 2 and 80
    or v_phone !~ '^[+][1-9][0-9]{5,14}$'
    or coalesce(cardinality(v_languages),0) not between 1 and 12
    or exists(select 1 from unnest(coalesce(p_languages,array[]::text[])) x
       where btrim(x)='' or length(btrim(x))>40) then
  raise exception 'Provide valid name, country, languages and international phone' using errcode='22023';
 end if;
 insert into public.david_operator_profiles(user_id,full_name,country,languages,phone)
 values (v_uid,v_name,v_country,v_languages,v_phone)
 on conflict (user_id) do update set full_name=excluded.full_name,country=excluded.country,
 languages=excluded.languages,phone=excluded.phone,updated_at=now();
 if exists(select 1 from public.david_members m where m.user_id=v_uid and m.role='worker') then
  v_status:='approved';
 else
  insert into public.david_google_access_requests(user_id,email,display_name,status)
  values(v_uid,v_email,v_name,'pending')
  on conflict(user_id) do update set display_name=excluded.display_name,last_seen_at=now()
  where public.david_google_access_requests.status='pending';
  select status into v_status from public.david_google_access_requests where user_id=v_uid;
 end if;
 return jsonb_build_object('ok',true,'status',coalesce(v_status,'pending'));
end $$;
revoke all on function public.david_operator_submit_profile(text,text,text[],text) from public,anon;
grant execute on function public.david_operator_submit_profile(text,text,text[],text) to authenticated;
