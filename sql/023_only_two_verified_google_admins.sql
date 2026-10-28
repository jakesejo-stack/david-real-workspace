-- DAVID production two-admin policy, 2026-10-28.
-- ONLY the verified Google identities for these 2 mailboxes may act as Admin.
-- All others may only be explicitly approved workers; no automatic worker access.

create or replace function david_internal.david_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
 select exists(
   select 1
   from public.david_members m
   join auth.users u on u.id=m.user_id
   join public.david_worker_identities wi on wi.user_id=m.user_id and wi.active=true
   where m.user_id=(select auth.uid()) and m.role='admin'
     and u.email_confirmed_at is not null
     and lower(btrim(u.email)) in (
       'borquitokonsejo@gmail.com',
       'soulflame.mitko@gmail.com'
     )
     and exists (
       select 1 from auth.identities i
       where i.user_id=u.id and i.provider='google'
     )
 );
$$;

create or replace function david_internal.david_bootstrap_admins()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
 if new.email_confirmed_at is not null
   and lower(btrim(new.email)) in (
     'borquitokonsejo@gmail.com',
     'soulflame.mitko@gmail.com'
   ) then
   insert into public.david_members(user_id,role,display_name)
   values(new.id,'admin',
     case lower(btrim(new.email))
       when 'soulflame.mitko@gmail.com' then 'SoulFlame Mitko'
       else 'DAVID Owner'
     end)
   on conflict(user_id) do update set role='admin';
 end if;
 -- Stop retaining administrator status if the owner's/second admin's email changes.
 if TG_OP='UPDATE'
   and lower(btrim(coalesce(old.email,''))) in (
     'borquitokonsejo@gmail.com',
     'soulflame.mitko@gmail.com'
   )
   and lower(btrim(coalesce(new.email,''))) not in (
     'borquitokonsejo@gmail.com',
     'soulflame.mitko@gmail.com'
   ) then
   update public.david_members set role='worker' where user_id=new.id and role='admin';
   update public.david_worker_identities set active=false,updated_at=now()
     where user_id=new.id and active=true;
 end if;
 return new;
end;
$$;

create or replace function david_internal.david_provision_verified_admin_identity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
 if new.role='admin' and exists(
   select 1 from auth.users u
   where u.id=new.user_id and u.email_confirmed_at is not null
     and lower(btrim(u.email)) in (
       'borquitokonsejo@gmail.com',
       'soulflame.mitko@gmail.com'
     )
 ) then
   select id into v_org from public.david_organizations where slug='soulflame';
   if v_org is null then raise exception 'DAVID organization unavailable';end if;
   insert into public.david_worker_identities(user_id,organization_id,active)
   values(new.user_id,v_org,true)
   on conflict(user_id) do nothing;
 end if;
 return new;
end;
$$;

-- Defense in depth: even server-side upsert logic must not create a
-- nonallowlisted admin membership.
create or replace function david_internal.david_enforce_two_admin_mailboxes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_mailbox text;
begin
 if new.role='admin' then
   select lower(btrim(email)) into v_mailbox
   from auth.users where id=new.user_id and email_confirmed_at is not null;
   if v_mailbox is null or v_mailbox not in(
     'borquitokonsejo@gmail.com',
     'soulflame.mitko@gmail.com'
   ) then
     raise exception 'Only the two approved Google mailboxes can be admins'
       using errcode='42501';
   end if;
 end if;
 return new;
end;
$$;

drop trigger if exists david_two_admin_membership_gate on public.david_members;
create trigger david_two_admin_membership_gate
before insert or update of role,user_id on public.david_members
for each row execute function david_internal.david_enforce_two_admin_mailboxes();

create or replace function public.david_admin_enroll_member(
 p_email text,p_role text default 'worker')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
 v_user uuid;
 v_email text:=lower(btrim(coalesce(p_email,'')));
 v_role text:=lower(btrim(coalesce(p_role,'')));
begin
 if not david_internal.david_is_admin() then
   raise exception 'Admin only' using errcode='42501';end if;
 if v_role not in ('worker','admin') then
   raise exception 'Role not allowed' using errcode='22023';end if;
 if v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then
   raise exception 'Invalid email' using errcode='22023';end if;
 if v_role='admin' and v_email not in (
   'borquitokonsejo@gmail.com',
   'soulflame.mitko@gmail.com'
 ) then raise exception 'This email cannot be an administrator'
    using errcode='42501';end if;
 if v_role='worker' and v_email in (
   'borquitokonsejo@gmail.com',
   'soulflame.mitko@gmail.com'
 ) then raise exception 'Reserved administrator identity'
    using errcode='42501';end if;
 select u.id into v_user
 from auth.users u
 where lower(btrim(u.email))=v_email
   and u.email_confirmed_at is not null
   and exists(select 1 from auth.identities i
              where i.user_id=u.id and i.provider='google')
 limit 1;
 if v_user is null then
   raise exception 'Verified Google sign-in required first' using errcode='42501';
 end if;
 insert into public.david_members(user_id,role,display_name)
 values(v_user,v_role,
   case when v_email='soulflame.mitko@gmail.com' then 'SoulFlame Mitko'
        when v_role='admin' then 'DAVID Owner'
        else split_part(v_email,'@',1) end)
 on conflict(user_id) do update set role=excluded.role;
 return jsonb_build_object('ok',true,'user_id',v_user,
    'email',v_email,'role',v_role);
end;
$$;
revoke all on function public.david_admin_enroll_member(text,text) from public,anon;
grant execute on function public.david_admin_enroll_member(text,text) to authenticated;

create or replace function public.david_admin_invite_worker(
 p_email text,p_name text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_email text:=lower(btrim(coalesce(p_email,'')));v_id uuid;
begin
 if not david_internal.david_is_admin() then
   raise exception 'Admin required' using errcode='42501'; end if;
 if length(v_email) not between 5 and 254
   or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
   or length(coalesce(p_name,''))>150 then
     raise exception 'Invalid invitation' using errcode='22023';end if;
 if v_email in (
   'borquitokonsejo@gmail.com',
   'soulflame.mitko@gmail.com'
 ) then raise exception 'Reserved administrator identity' using errcode='42501';end if;
 if exists(select 1 from public.david_worker_invites
           where email=v_email and status='active') then
   raise exception 'Worker already approved' using errcode='42501';end if;
 insert into public.david_worker_invites(email,display_name,invited_by)
 values(v_email,btrim(coalesce(p_name,'')),auth.uid())
 on conflict(email) do update set status='pending',
   invited_by=auth.uid(),display_name=excluded.display_name,updated_at=now()
 returning id into v_id;
 insert into public.david_audit_events(actor_id,action,details)
 values(auth.uid(),'worker_invited',jsonb_build_object('invite_id',v_id));
 return jsonb_build_object('ok',true,'invite_id',v_id,'status','pending');
end;
$$;
revoke all on function public.david_admin_invite_worker(text,text) from public,anon;
grant execute on function public.david_admin_invite_worker(text,text) to authenticated;

-- The formerly enabled third administrator is now inactive and can only be
-- re-invited as a regular worker. Deactivation triggers automatic portal/OS revocation.
update public.david_members m
set role='worker'
from auth.users u
where m.user_id=u.id
  and lower(btrim(u.email))='soulflame.dpp@gmail.com'
  and m.role='admin';
update public.david_worker_identities wi
set active=false,updated_at=now()
from auth.users u
where wi.user_id=u.id
  and lower(btrim(u.email))='soulflame.dpp@gmail.com'
  and wi.active=true;
update public.david_link_codes lc
set status='revoked'
from public.david_worker_identities wi join auth.users u on u.id=wi.user_id
where lc.worker_id=wi.worker_id
 and lower(btrim(u.email))='soulflame.dpp@gmail.com'
 and lc.status='issued';
update public.david_worker_links wl
set revoked_at=now()
from public.david_worker_identities wi join auth.users u on u.id=wi.user_id
where wl.worker_id=wi.worker_id
 and lower(btrim(u.email))='soulflame.dpp@gmail.com'
 and wl.revoked_at is null;
update public.david_operator_portal_sessions s
set revoked_at=now()
from auth.users u
where s.user_id=u.id and lower(btrim(u.email))='soulflame.dpp@gmail.com'
 and s.revoked_at is null;

-- Keep traceability without storing passwords or issued codes.
insert into public.david_audit_events(actor_id,action,details)
select au.id,'two_admin_google_only_policy_applied',
 jsonb_build_object('allowed_admin_emails',
   jsonb_build_array('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com'),
   'previous_third_admin','demoted_and_disabled',
   'source','explicit owner request 2026-10-28')
from auth.users au where lower(btrim(au.email))='borquitokonsejo@gmail.com'
 and not exists(
   select 1 from public.david_audit_events ae
   where ae.action='two_admin_google_only_policy_applied'
 );
