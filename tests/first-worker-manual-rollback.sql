-- Execute AFTER migration 015 in a disposable test DB, or together with
-- migration 015 inside the SAME ROLLBACK transaction on Call Desk.
-- Simulated JWT claims are not evidence of a real browser OAuth session.
begin;
select set_config('request.jwt.claim.sub',
  (select user_id::text from public.david_members where role='admin' limit 1),true);
do $test$
declare
  v_uid uuid;
  v_company uuid;
  v_foreign uuid;
  v_action uuid := gen_random_uuid();
  v_response jsonb;
  v_replay jsonb;
  v_before_calls bigint;
  v_after_calls bigint;
  v_audit_count integer;
begin
  select user_id into v_uid from public.david_members where role='admin' limit 1;
  if v_uid is null then raise exception 'Fixture admin missing'; end if;
  select id into v_company from public.david_companies order by id limit 1;
  select id into v_foreign from public.david_companies where id<>v_company order by id limit 1;
  if v_company is null or v_foreign is null then raise exception 'Need 2 existing companies'; end if;
  select count(*) into v_before_calls from public.david_call_logs;
  -- ROLLBACK restores all original values; no actual calling occurs.
  update public.david_companies
    set assigned_to=v_uid,calling_approved=true,do_not_call=false,
        contact_phone='+359888000001'
    where id=v_company;
  update public.david_members set role='worker' where user_id=v_uid;
  v_response:=public.david_worker_log_manual_activity(
    v_company,'interested','ROLLBACK TEST',null,v_action);
  if v_response->>'ok'<>'true' or v_response->>'duplicate'<>'false' then
    raise exception 'FAIL: first manual insert';
  end if;
  v_replay:=public.david_worker_log_manual_activity(
    v_company,'interested','ROLLBACK TEST',null,v_action);
  if v_replay->>'duplicate'<>'true' or
    v_replay->>'activity_id'<>v_response->>'activity_id' then
    raise exception 'FAIL: duplicate action was not idempotent';
  end if;
  select count(*) into v_audit_count from public.david_audit_events
    where action='manual_contact_result'
      and details->>'activity_id'=v_response->>'activity_id';
  if v_audit_count<>1 then raise exception 'FAIL: duplicate audit'; end if;
  begin
    perform public.david_worker_log_manual_activity(
      v_foreign,'no_answer','unauthorized',null,gen_random_uuid());
    raise exception 'FAIL: unassigned company allowed';
  exception when insufficient_privilege then null;
  end;
  v_response:=public.david_worker_log_manual_activity(
    v_company,'opt_out','Do not call again',null,gen_random_uuid());
  if (select do_not_call from public.david_companies where id=v_company) is not true then
    raise exception 'FAIL: opt-out not persisted';
  end if;
  begin
    perform public.david_worker_log_manual_activity(
      v_company,'no_answer','should deny',null,gen_random_uuid());
    raise exception 'FAIL: do-not-call bypass';
  exception when insufficient_privilege then null;
  end;
  update public.david_worker_identities set active=false where user_id=v_uid;
  begin
    perform public.david_worker_log_manual_activity(
      v_company,'no_answer','revoked',null,gen_random_uuid());
    raise exception 'FAIL: revoked worker allowed';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_after_calls from public.david_call_logs;
  if v_after_calls<>v_before_calls then raise exception 'FAIL: fabricated call log'; end if;
  raise notice 'PASS: manual result, replay, audit once, unassigned, opt-out, revocation, no CallSid';
end;
$test$;
rollback;
