-- P2 operator approval, one-time codes, atomic DAVID bridge.

create or replace function public.david_admin_set_worker_active(p_user_id uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_identity public.david_worker_identities%rowtype;
begin
 if auth.uid() is null or not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if not exists(select 1 from public.david_members where user_id=p_user_id and role in ('worker','admin')) then
   raise exception 'Approved membership required' using errcode='42501'; end if;
 select id into v_org from public.david_organizations where slug='soulflame';
 insert into public.david_worker_identities(user_id,organization_id,active) values(p_user_id,v_org,p_active)
 on conflict(user_id) do update set active=excluded.active,updated_at=now();
 select * into v_identity from public.david_worker_identities where user_id=p_user_id;
 if not p_active then
  update public.david_link_codes set status='revoked' where worker_id=v_identity.worker_id and status='issued';
  update public.david_worker_links set revoked_at=now() where worker_id=v_identity.worker_id and revoked_at is null;
 end if;
 return jsonb_build_object('worker_id',v_identity.worker_id,'organization_id',v_org,'active',p_active);
end; $$;
revoke all on function public.david_admin_set_worker_active(uuid,boolean) from public,anon;
grant execute on function public.david_admin_set_worker_active(uuid,boolean) to authenticated;

create or replace function public.david_issue_link_code(p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_role text;v_identity public.david_worker_identities%rowtype;v_exp timestamptz:=now()+interval '12 minutes';
begin
 if v_uid is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid request' using errcode='42501';end if;
 select role into v_role from public.david_members where user_id=v_uid;
 select * into v_identity from public.david_worker_identities where user_id=v_uid for update;
 if not found or not v_identity.active or v_role not in ('worker','admin') then
   raise exception 'Worker not approved' using errcode='42501';end if;
 if exists(select 1 from public.david_link_codes where worker_id=v_identity.worker_id and issued_at>now()-interval '45 seconds') then
   raise exception 'Retry later';end if;
 if (select count(*) from public.david_link_codes where worker_id=v_identity.worker_id and issued_at>now()-interval '1 hour')>=6 then
   raise exception 'Hourly limit exceeded';end if;
 update public.david_link_codes set status='revoked' where worker_id=v_identity.worker_id and status='issued';
 insert into public.david_link_codes(worker_id,code_hash,expires_at) values(v_identity.worker_id,p_code_hash,v_exp);
 return jsonb_build_object('worker_id',v_identity.worker_id,'organization_id',v_identity.organization_id,'role',v_role,'expires_at',v_exp);
end; $$;
revoke all on function public.david_issue_link_code(text) from public,anon;
grant execute on function public.david_issue_link_code(text) to authenticated;

create or replace function public.david_redeem_link_code(p_code_hash text,p_external_user_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_code public.david_link_codes%rowtype;v_identity public.david_worker_identities%rowtype;v_role text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
   raise exception 'Service authorization required' using errcode='42501';end if;
 if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' or p_external_user_id is null
    or length(p_external_user_id) not between 1 and 256 then
  return jsonb_build_object('ok',false,'reason','invalid');end if;
 perform pg_advisory_xact_lock(hashtext(p_external_user_id));
 if (select count(*) from public.david_link_attempts where external_user_id=p_external_user_id
   and attempted_at>now()-interval '15 minutes')>=10 then
  insert into public.david_link_attempts(external_user_id,result) values(p_external_user_id,'rate_limited');
  return jsonb_build_object('ok',false,'reason','rate_limited');end if;
 select * into v_code from public.david_link_codes where code_hash=p_code_hash for update;
 if not found or v_code.status<>'issued' or v_code.expires_at<=now() then
  insert into public.david_link_attempts(external_user_id,result) values(p_external_user_id,'invalid');
  return jsonb_build_object('ok',false,'reason','invalid');end if;
 select * into v_identity from public.david_worker_identities where worker_id=v_code.worker_id for update;
 select role into v_role from public.david_members where user_id=v_identity.user_id;
 if not v_identity.active or v_role not in ('worker','admin') then
  insert into public.david_link_attempts(external_user_id,result) values(p_external_user_id,'rejected');
  return jsonb_build_object('ok',false,'reason','inactive');end if;
 if exists(select 1 from public.david_worker_links where worker_id=v_identity.worker_id and revoked_at is null)
  or exists(select 1 from public.david_worker_links where organization_id=v_identity.organization_id
    and external_user_id=p_external_user_id and revoked_at is null) then
  insert into public.david_link_attempts(external_user_id,result) values(p_external_user_id,'rejected');
  return jsonb_build_object('ok',false,'reason','already_linked');end if;
 update public.david_link_codes set status='redeemed',redeemed_at=now() where id=v_code.id;
 insert into public.david_worker_links(worker_id,organization_id,external_user_id)
 values(v_identity.worker_id,v_identity.organization_id,p_external_user_id);
 insert into public.david_link_attempts(external_user_id,result) values(p_external_user_id,'redeemed');
 return jsonb_build_object('ok',true,'worker_id',v_identity.worker_id,'organization_id',v_identity.organization_id,
  'role',v_role,'active',true,'external_user_id',p_external_user_id);
end; $$;
revoke all on function public.david_redeem_link_code(text,text) from public,anon,authenticated;
grant execute on function public.david_redeem_link_code(text,text) to service_role;

create or replace function public.david_verify_worker_link(p_external_user_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_record record;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
   raise exception 'Service authorization required' using errcode='42501';end if;
 select l.id as link_id,l.worker_id,l.organization_id,m.role,i.active into v_record
 from public.david_worker_links l
 join public.david_worker_identities i on i.worker_id=l.worker_id
 join public.david_members m on m.user_id=i.user_id
 where l.external_user_id=p_external_user_id and l.revoked_at is null and i.active=true
 and m.role in ('worker','admin') limit 1;
 if not found then return jsonb_build_object('active',false);end if;
 update public.david_worker_links set last_verified_at=now() where id=v_record.link_id;
 return jsonb_build_object('active',true,'worker_id',v_record.worker_id,'organization_id',v_record.organization_id,
   'role',v_record.role,'external_user_id',p_external_user_id);
end; $$;
revoke all on function public.david_verify_worker_link(text) from public,anon,authenticated;
grant execute on function public.david_verify_worker_link(text) to service_role;

