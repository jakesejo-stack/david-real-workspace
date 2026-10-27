-- P3.2: preparation claim is not permission to place a call.
-- Applied in Supabase DAVID Call Desk on 2026-10-28.
create or replace function public.david_prepare_company(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_company public.david_companies%rowtype;
  v_claim timestamptz;
begin
  if v_uid is null then raise exception 'Login required' using errcode='42501'; end if;
  select role into v_role from public.david_members where user_id=v_uid;
  if not (v_role='worker' or david_internal.david_is_admin()) then
    raise exception 'Worker authorization required' using errcode='42501';
  end if;
  select * into v_company from public.david_companies where id=p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  if v_company.do_not_call then raise exception 'Do not contact restriction'; end if;
  if exists (select 1 from public.david_call_logs l where l.company_id=p_company_id) then
    raise exception 'Company already contacted. Admin follow-up approval required';
  end if;
  if v_company.claimed_by is not null and v_company.claimed_by <> v_uid
     and v_company.claimed_until > now() then
    raise exception 'Company is reserved by another worker';
  end if;
  if v_company.assigned_to is not null and v_company.assigned_to <> v_uid
     and not (v_company.claimed_by=v_company.assigned_to and v_company.claimed_until < now()) then
    raise exception 'Company is assigned to another worker';
  end if;
  v_claim := now() + interval '30 minutes';
  update public.david_companies
    set assigned_to=v_uid, claimed_by=v_uid, claimed_at=now(),
        claimed_until=v_claim, updated_at=now()
  where id=p_company_id;
  return jsonb_build_object(
    'ok',true,'company_id',p_company_id,'claimed_until',v_claim,
    'can_start_call',(v_company.calling_approved
      and coalesce(v_company.contact_phone,'') ~ '^\+[1-9][0-9]{5,14}$')
  );
end;
$$;
revoke all on function public.david_prepare_company(uuid) from public, anon;
grant execute on function public.david_prepare_company(uuid) to authenticated;
