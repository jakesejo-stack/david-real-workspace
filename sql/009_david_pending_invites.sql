-- Captured from the live, deployed DAVID Call Desk schema on 2026-10-28.
create table if not exists public.david_worker_invites(
 id uuid primary key default gen_random_uuid(),
 email text not null unique,display_name text not null default '',
 status text not null default 'pending' check(status in ('pending','active','blocked')),
 invited_by uuid not null references auth.users(id),invited_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,
 linked_user_id uuid references auth.users(id),updated_at timestamptz not null default now()
);
alter table public.david_worker_invites enable row level security;
revoke all on public.david_worker_invites from anon,authenticated;
grant select on public.david_worker_invites to authenticated;
drop policy if exists david_worker_invites_admin_read on public.david_worker_invites;
create policy david_worker_invites_admin_read on public.david_worker_invites for select to authenticated using(david_internal.david_is_admin());

CREATE OR REPLACE FUNCTION public.david_admin_invite_worker(p_email text, p_name text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text := lower(trim(coalesce(p_email,'')));v_id uuid;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if length(v_email) not between 5 and 254
    or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
    or length(p_name)>150 then raise exception 'Invalid invitation';end if;
 if v_email in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com') then
   raise exception 'Reserved administrator identity';end if;
 insert into public.david_worker_invites(email,display_name,invited_by)
 values(v_email,trim(p_name),auth.uid())
 on conflict(email) do update set status='pending',invited_by=auth.uid(),
 display_name=excluded.display_name,updated_at=now()
 returning id into v_id;
 insert into public.david_audit_events(actor_id,action,details)
 values(auth.uid(),'worker_invited',jsonb_build_object('invite_id',v_id));
 return jsonb_build_object('ok',true,'invite_id',v_id,'status','pending');
end;
$function$
;
revoke all on function public.david_admin_invite_worker(text,text) from public,anon;
grant execute on function public.david_admin_invite_worker(text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.david_admin_approve_worker_invite(p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_inv public.david_worker_invites%rowtype; v_uid uuid;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 select * into v_inv from public.david_worker_invites where id=p_invite_id for update;
 if not found or v_inv.status<>'pending' then raise exception 'Invitation not pending';end if;
 select u.id into v_uid from auth.users u where lower(u.email)=v_inv.email
 and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google';
 if v_uid is null then raise exception 'Google sign-in required before approval';end if;
 perform public.david_admin_enroll_member(v_inv.email,'worker');
 perform public.david_admin_set_worker_active(v_uid,true);
 update public.david_worker_invites set status='active',linked_user_id=v_uid,
 reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_invite_id;
 insert into public.david_audit_events(actor_id,action,details)
 values(auth.uid(),'worker_approved',jsonb_build_object('invite_id',p_invite_id,'user_id',v_uid));
 return jsonb_build_object('ok',true,'status','active','user_id',v_uid);
end;$function$
;
revoke all on function public.david_admin_approve_worker_invite(uuid) from public,anon;
grant execute on function public.david_admin_approve_worker_invite(uuid) to authenticated;
