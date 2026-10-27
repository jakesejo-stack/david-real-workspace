-- P2 regression test for Supabase SQL editor, run by trusted administrator only.
-- Test uses the existing admin as fixture; all changes are rolled back.
-- Simulated JWT claims in SQL do NOT test real HTTP authentication.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.david_members where role='admin' limit 1),true);
do $$
declare v_issue jsonb;v_first jsonb;v_replay jsonb;v_valid jsonb;v_after jsonb;v_uid uuid;
begin
 select user_id into v_uid from public.david_members where role='admin' limit 1;
 v_issue:=public.david_issue_link_code(repeat('a',64));
 if v_issue->>'worker_id' is null then raise exception 'Issue failed';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_first:=public.david_redeem_link_code(repeat('a',64),'p2-smoke-test-operator');
 if v_first->>'ok'<>'true' then raise exception 'First redeem failed';end if;
 v_replay:=public.david_redeem_link_code(repeat('a',64),'p2-smoke-test-operator');
 if v_replay->>'ok'<>'false' then raise exception 'Replay accepted';end if;
 v_valid:=public.david_verify_worker_link('p2-smoke-test-operator');
 if v_valid->>'active'<>'true' then raise exception 'Verify active failed';end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform public.david_admin_set_worker_active(v_uid,false);
 perform set_config('request.jwt.claim.role','service_role',true);
 v_after:=public.david_verify_worker_link('p2-smoke-test-operator');
 if v_after->>'active'<>'false' then raise exception 'Revocation failed';end if;
end $$;
select 'PASS: atomic redeem, replay denial, verify, revocation' as test;
rollback;

-- Execute this separately if needed. Use a SAVEPOINT to avoid raising test errors.
begin;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$
begin
 begin
  perform public.david_issue_link_code(repeat('f',64));
  raise exception 'BUG unapproved user issued code';
 exception when others then
  if SQLERRM='BUG unapproved user issued code' then raise;end if;
  if SQLSTATE<>'42501' then raise exception 'Unexpected denial: %',SQLSTATE;end if;
 end;
end $$;
select 'PASS: unauthorized user denied' as test;
rollback;
