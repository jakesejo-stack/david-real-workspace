-- DAVID Real Workspace: exact three-email admin allowlist, Google-required for DPP mailbox
create or replace function david_internal.david_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.david_members m
  join auth.users u on u.id=m.user_id
  join public.david_worker_identities wi on wi.user_id=m.user_id and wi.active=true
  where m.user_id=(select auth.uid()) and m.role='admin'
    and u.email_confirmed_at is not null
    and lower(u.email) in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com','soulflame.dpp@gmail.com')
    and (lower(u.email)<>'soulflame.dpp@gmail.com'
      or exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google'))
 );
$$;
create or replace function david_internal.david_bootstrap_admins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.email_confirmed_at is not null and
   lower(new.email) in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com','soulflame.dpp@gmail.com') then
   insert into public.david_members(user_id,role,display_name)
   values(new.id,'admin',
     case lower(new.email)
       when 'soulflame.mitko@gmail.com' then 'SoulFlame Mitko'
       when 'soulflame.dpp@gmail.com' then 'SoulFlame DPP'
       else 'DAVID Owner' end)
   on conflict(user_id) do update set role='admin';
 end if;
 return new;
end; $$;
create or replace function david_internal.david_provision_verified_admin_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
 if new.role='admin' and exists (
  select 1 from auth.users u where u.id=new.user_id and u.email_confirmed_at is not null
  and lower(u.email) in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com','soulflame.dpp@gmail.com')
 ) then
  select id into v_org from public.david_organizations where slug='soulflame';
  if v_org is null then raise exception 'DAVID organization unavailable'; end if;
  insert into public.david_worker_identities(user_id,organization_id,active)
  values(new.user_id,v_org,true) on conflict(user_id) do nothing;
 end if;
 return new;
end; $$;
create or replace function public.david_admin_enroll_member(p_email text,p_role text default 'worker')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_role text:=lower(trim(p_role)); v_email text:=lower(trim(p_email));
begin
 if not david_internal.david_is_admin() then raise exception 'Admin only' using errcode='42501';end if;
 if v_role not in ('worker','admin') then raise exception 'Role not allowed';end if;
 if v_role='admin' and v_email not in
   ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com','soulflame.dpp@gmail.com') then
   raise exception 'This email cannot be an administrator' using errcode='42501';
 end if;
 if v_role='worker' and v_email in
   ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com','soulflame.dpp@gmail.com') then
   raise exception 'Reserved administrative identity' using errcode='42501';
 end if;
 select u.id into v_user from auth.users u
 where lower(u.email)=v_email and u.email_confirmed_at is not null
 and (v_role<>'admin' or v_email<>'soulflame.dpp@gmail.com'
    or exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'));
 if v_user is null then raise exception 'The user must verify their Google sign-in first';end if;
 insert into public.david_members(user_id,role,display_name)
 values(v_user,v_role,case when v_email='soulflame.mitko@gmail.com' then 'SoulFlame Mitko'
 when v_email='soulflame.dpp@gmail.com' then 'SoulFlame DPP'
 when v_role='admin' then 'DAVID Owner' else split_part(v_email,'@',1) end)
 on conflict(user_id) do update set role=excluded.role;
 return jsonb_build_object('ok',true,'user_id',v_user,'email',v_email,'role',v_role);
end; $$;