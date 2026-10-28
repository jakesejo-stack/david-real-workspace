-- Safety regression: exactly two active verified Google administrators.
-- Execute in read-only SQL editor or CI with DBA role; no impersonation or fake calls.
do $$
declare v_count int;
begin
 select count(*) into v_count
 from public.david_members m
 join auth.users u on u.id=m.user_id
 join public.david_worker_identities wi on wi.user_id=u.id
 where m.role='admin' and wi.active=true and u.email_confirmed_at is not null
   and lower(btrim(u.email)) in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com')
   and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if v_count<>2 then raise exception 'Two verified active admins expected, found %', v_count;end if;
 if exists(
  select 1 from public.david_members m join auth.users u on u.id=m.user_id
  where m.role='admin'
    and lower(btrim(u.email)) not in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com')
 ) then raise exception 'Non-allowlisted admin membership exists';end if;
 if not exists (
  select 1 from public.david_members m join auth.users u on u.id=m.user_id
  join public.david_worker_identities wi on wi.user_id=m.user_id
  where lower(btrim(u.email))='jakesejo@gmail.com' and m.role='worker' and wi.active=true
 ) then raise exception 'First pilot worker unexpectedly inactive';end if;
 if exists (
  select 1 from public.david_worker_identities wi join auth.users u on u.id=wi.user_id
  where lower(btrim(u.email))='soulflame.dpp@gmail.com' and wi.active=true
 ) then raise exception 'Former third admin still active';end if;
end $$;
select 'TWO_VERIFIED_ADMINS_ONLY_PASS' as test;
-- Use an explicit transaction + exception handler to verify the
-- david_two_admin_membership_gate rejects promoting an arbitrary email.
begin;
do $$
declare v_uuid uuid; v_denied boolean:=false;
begin
 select id into v_uuid from auth.users where lower(email)='soulflame.dpp@gmail.com';
 if v_uuid is null then raise exception 'Test third identity missing';end if;
 begin
  update public.david_members set role='admin' where user_id=v_uuid;
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'Unexpected third-admin promotion';end if;
end $$;
select 'NONALLOWLISTED_ADMIN_REJECTED_PASS' as test;
rollback;
