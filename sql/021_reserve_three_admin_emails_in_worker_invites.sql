-- Keep all three verified SoulFlame administrator addresses out of worker invitations.
create or replace function public.david_admin_invite_worker(
 p_email text,p_name text default ''
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_email text:=lower(trim(coalesce(p_email,''))); v_id uuid;
begin
 if not david_internal.david_is_admin() then
  raise exception 'Admin required' using errcode='42501';
 end if;
 if length(v_email) not between 5 and 254
  or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
  or length(coalesce(p_name,''))>150 then
  raise exception 'Invalid invitation' using errcode='22023';
 end if;
 if v_email in (
 'borquitokonsejo@gmail.com','soulflame.mitko@gmail.com','soulflame.dpp@gmail.com'
 ) then raise exception 'Reserved administrator identity' using errcode='42501';end if;
 if exists(select 1 from public.david_worker_invites where email=v_email and status='active') then
  raise exception 'Worker already approved' using errcode='42501';end if;
 insert into public.david_worker_invites(email,display_name,invited_by)
 values(v_email,trim(coalesce(p_name,'')),auth.uid())
 on conflict(email) do update set status='pending',invited_by=auth.uid(),
 display_name=excluded.display_name,updated_at=now()
 returning id into v_id;
 insert into public.david_audit_events(actor_id,action,details)
 values(auth.uid(),'worker_invited',jsonb_build_object('invite_id',v_id));
 return jsonb_build_object('ok',true,'invite_id',v_id,'status','pending');
end;$fn$;
revoke all on function public.david_admin_invite_worker(text,text) from public,anon;
grant execute on function public.david_admin_invite_worker(text,text) to authenticated;