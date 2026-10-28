-- Correct a real linked-Google edge case on Call Desk.
-- auth.users.raw_app_meta_data.provider can remain "email" after Google identity linking.
-- Require a VERIFIED account with an actual Google identity row instead.
-- IMPORTANT: Google sign-in alone still never approves a worker.
create or replace function public.david_admin_approve_worker_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_inv public.david_worker_invites%rowtype;
  v_uid uuid;
begin
  if not david_internal.david_is_admin() then
    raise exception 'Admin required' using errcode='42501';
  end if;
  select * into v_inv from public.david_worker_invites
    where id=p_invite_id for update;
  if not found or v_inv.status<>'pending' then
    raise exception 'Invitation not pending' using errcode='42501';
  end if;
  select u.id into v_uid
  from auth.users u
  where lower(u.email)=v_inv.email
    and u.email_confirmed_at is not null
    and exists (
      select 1 from auth.identities i
      where i.user_id=u.id and i.provider='google'
    )
  limit 1;
  if v_uid is null then
    raise exception 'Verified linked Google identity required' using errcode='42501';
  end if;
  perform public.david_admin_enroll_member(v_inv.email,'worker');
  perform public.david_admin_set_worker_active(v_uid,true);
  update public.david_worker_invites
    set status='active',linked_user_id=v_uid,
      reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_invite_id;
  insert into public.david_audit_events(actor_id,action,details)
    values(auth.uid(),'worker_approved',
      jsonb_build_object('invite_id',p_invite_id,'user_id',v_uid));
  return jsonb_build_object('ok',true,'status','active','user_id',v_uid);
end;
$function$;
revoke all on function public.david_admin_approve_worker_invite(uuid) from public,anon;
grant execute on function public.david_admin_approve_worker_invite(uuid) to authenticated;
