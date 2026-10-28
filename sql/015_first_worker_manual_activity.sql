-- First DPP worker MVP: human/manual contact results, no Twilio CallSid.
-- REVIEW/TEST BEFORE DEPLOYMENT. Do not connect to paid voice or expose secrets.
-- This additive migration does not modify the original Call Desk UI.
create table if not exists public.david_manual_contact_activities (
  id uuid primary key default gen_random_uuid(),
  client_action_id uuid not null unique,
  company_id uuid not null references public.david_companies(id) on delete cascade,
  worker_auth_user_id uuid not null references auth.users(id),
  result text not null check (result in ('no_answer','declined','interested','callback','opt_out')),
  notes text not null default '' check (char_length(notes) <= 2000),
  next_followup_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists david_manual_activity_company_idx
  on public.david_manual_contact_activities(company_id,created_at desc);
create index if not exists david_manual_activity_worker_idx
  on public.david_manual_contact_activities(worker_auth_user_id,created_at desc);
alter table public.david_manual_contact_activities enable row level security;
revoke all on public.david_manual_contact_activities from public, anon, authenticated;
grant select on public.david_manual_contact_activities to authenticated;
drop policy if exists david_manual_activity_read on public.david_manual_contact_activities;
create policy david_manual_activity_read on public.david_manual_contact_activities
for select to authenticated
using (
  david_internal.david_is_active_member() and (
    david_internal.david_is_admin() or
    (worker_auth_user_id=(select auth.uid()) and exists (
      select 1 from public.david_companies c
      where c.id=company_id and c.assigned_to=(select auth.uid())
    ))
  )
);

create or replace function public.david_worker_log_manual_activity(
  p_company_id uuid,
  p_result text,
  p_notes text,
  p_next_followup_at timestamptz,
  p_client_action_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_company public.david_companies%rowtype;
  v_id uuid;
  v_existing uuid;
  v_notes text := coalesce(p_notes,'');
begin
  -- Authenticate and authorize within the trusted database, never from client worker_id.
  if v_user is null or not david_internal.david_is_active_member()
    or not exists (
      select 1 from public.david_members m join auth.users u on u.id=m.user_id
      where m.user_id=v_user and m.role='worker' and u.email_confirmed_at is not null
        and u.raw_app_meta_data->>'provider'='google'
    ) then
    raise exception 'Approved Google worker required' using errcode='42501';
  end if;
  if p_client_action_id is null or p_company_id is null then
    raise exception 'Missing company or action ID' using errcode='22023';
  end if;
  -- Safe retries do not create duplicate results or audit entries.
  select id into v_existing from public.david_manual_contact_activities
  where client_action_id=p_client_action_id and worker_auth_user_id=v_user
    and company_id=p_company_id;
  if v_existing is not null then
    return jsonb_build_object('ok',true,'activity_id',v_existing,'duplicate',true);
  end if;
  if p_result not in ('no_answer','declined','interested','callback','opt_out')
     or char_length(v_notes)>2000 then
    raise exception 'Invalid result or notes' using errcode='22023';
  end if;
  if p_result='callback' and p_next_followup_at is null then
    raise exception 'Callback date required' using errcode='22023';
  end if;
  if p_next_followup_at is not null and
    (p_next_followup_at<=now() or p_next_followup_at>now()+interval '365 days') then
    raise exception 'Invalid next follow-up date' using errcode='22023';
  end if;
  select * into v_company from public.david_companies
  where id=p_company_id for update;
  if not found or v_company.assigned_to is distinct from v_user then
    raise exception 'Company not assigned to worker' using errcode='42501';
  end if;
  if not v_company.calling_approved or v_company.do_not_call
    or v_company.contact_phone !~ '^[+][1-9][0-9]{5,14}$' then
    raise exception 'Company not approved for manual calling' using errcode='42501';
  end if;
  insert into public.david_manual_contact_activities
    (client_action_id,company_id,worker_auth_user_id,result,notes,next_followup_at)
  values (p_client_action_id,p_company_id,v_user,p_result,v_notes,p_next_followup_at)
  on conflict (client_action_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_existing from public.david_manual_contact_activities
    where client_action_id=p_client_action_id and worker_auth_user_id=v_user
      and company_id=p_company_id;
    if v_existing is null then
      raise exception 'Action ID belongs to a different activity' using errcode='42501';
    end if;
    return jsonb_build_object('ok',true,'activity_id',v_existing,'duplicate',true);
  end if;
  if p_result='opt_out' then
    update public.david_companies set do_not_call=true,updated_at=now()
    where id=p_company_id;
  end if;
  -- Audit metadata only. No notes, personal phone, secret, or fabricated call SID.
  insert into public.david_audit_events(actor_id,action,company_id,details)
  values (v_user,'manual_contact_result',p_company_id,
    jsonb_build_object('activity_id',v_id,'result',p_result,'source','manual'));
  return jsonb_build_object('ok',true,'activity_id',v_id,'duplicate',false);
end;
$function$;
revoke all on function public.david_worker_log_manual_activity(uuid,text,text,timestamptz,uuid)
  from public,anon;
grant execute on function public.david_worker_log_manual_activity(uuid,text,text,timestamptz,uuid)
  to authenticated;
