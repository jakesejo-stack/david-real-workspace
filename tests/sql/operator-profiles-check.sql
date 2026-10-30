-- Run after fixture + 019, all IDs are synthetic.
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','worker1@example.org',now()),
 ('22222222-2222-4222-8222-222222222222','worker2@example.org',now());
insert into auth.identities(user_id,provider) values
 ('11111111-1111-4111-8111-111111111111','google'),
 ('22222222-2222-4222-8222-222222222222','google');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare result jsonb;
begin
 result:=public.david_operator_submit_profile('Test Worker One','Bulgaria',array['Bulgarian','English'],'+359888123456');
 if result->>'status'<>'pending' then raise exception 'Application not pending: %',result;end if;
 if (select count(*) from public.david_operator_profiles)<>1 then raise exception 'Own profile must be readable';end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ begin
 if exists(select 1 from public.david_operator_profiles) then raise exception 'Cross-worker profile leaked';end if;
 begin
  perform public.david_operator_submit_profile('T','Nowhere',array[]::text[],'broken');
  raise exception 'Invalid profile accepted';
 exception when sqlstate '22023' then null;
 end;
 perform public.david_operator_submit_profile('Test Worker Two','Spain',array['Spanish'],'+34600111222');
 if (select count(*) from public.david_operator_profiles)<>1 then raise exception 'Second operator sees another profile';end if;
end $$;
reset role;
set role anon;
do $$ begin
 begin
  perform public.david_operator_submit_profile('Anon User','Country',array['Language'],'+359888123456');
  raise exception 'Anonymous application accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
