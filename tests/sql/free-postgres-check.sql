-- No real customer records or phone calls: only synthetic identifiers and fake numbers.
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','admin@example.test',now()),
('22222222-2222-4222-8222-222222222222','operator@example.test',now()),
('33333333-3333-4333-8333-333333333333','outsider@example.test',now());
insert into auth.identities(user_id,provider) values
('11111111-1111-4111-8111-111111111111','google'),
('22222222-2222-4222-8222-222222222222','google');
insert into public.david_members(user_id,role,display_name) values
('11111111-1111-4111-8111-111111111111','admin','Owner'),
('22222222-2222-4222-8222-222222222222','worker','Operator'),
('33333333-3333-4333-8333-333333333333','worker','Outsider');
insert into public.david_worker_identities(user_id,active) values
('22222222-2222-4222-8222-222222222222',false),
('33333333-3333-4333-8333-333333333333',false);
insert into public.david_companies(id,company_name,country,sector,contact_phone,
 contact_source,calling_approved) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA Only','Bulgaria','Testing',
 '+359888000001','synthetic_fixture',true);
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.david_operator_submit_application(
 'Test Operator','Bulgaria',array['Bulgarian','English'],'+359888000002');
do $$
begin
 if not exists(select 1 from public.david_operator_applications
 where user_id=auth.uid() and status='submitted') then
 raise exception 'Operator application missing'; end if;
end $$;
-- Unverified outsider must not become an applicant.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
begin
 begin
 perform public.david_operator_submit_application('Fake','Bulgaria',array['English'],'+359888000003');
 raise exception 'SECURITY FAILURE: non-Google applicant accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
-- Activation gate must protect even direct writes from backend paths.
update public.david_worker_identities set active=true
where user_id='22222222-2222-4222-8222-222222222222';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare v jsonb;
begin
 v:=public.david_admin_create_company_task(
 '22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Contact QA Only','Synthetic test','P2',null);
 if v->>'ok' <> 'true' then raise exception 'Admin task creation failed';end if;
end $$;
-- Worker sees only owned company, and can save synthetic self-reported results.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare v jsonb; t uuid;
begin
 v:=public.david_worker_my_tasks();
 if jsonb_array_length(v)<>1 then raise exception 'Worker tasks not scoped';end if;
 v:=public.david_worker_my_companies('');
 if jsonb_array_length(v)<>1 then raise exception 'Assigned company not scoped';end if;
 v:=public.david_worker_company_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if v->>'ok'<>'true' then raise exception 'Company detail failed'; end if;
 select id into t from public.david_admin_tasks limit 1;
 v:=public.david_worker_save_task_interaction(t,'note','Synthetic note',null,false);
 if v->>'source'<>'operator_self_reported' then
   raise exception 'Manual entry mislabelled as real Twilio call';end if;
end $$;
-- An unapproved user cannot view another operator's records.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
begin
 begin
 perform public.david_worker_my_companies('');
 raise exception 'SECURITY FAILURE: unapproved worker got CRM';
 exception when insufficient_privilege then null;
 end;
 begin
 perform public.david_worker_company_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 raise exception 'SECURITY FAILURE: unapproved worker got customer detail';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'isolated migration & authorization checks passed' as test_result;
