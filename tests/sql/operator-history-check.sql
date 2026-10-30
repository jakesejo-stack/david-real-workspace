-- Synthetic isolated PostgreSQL test. Never connects to production.
create table public.david_manual_contact_results (
 id uuid primary key default gen_random_uuid(),
 company_id uuid references public.david_companies(id),
 worker_user_id uuid references auth.users(id),
 outcome text,notes text,created_at timestamptz not null default now(),
 followup_at timestamptz
);
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','worker1@example.org',now()),
 ('22222222-2222-4222-8222-222222222222','worker2@example.org',now());
insert into auth.identities(user_id,provider) values
 ('11111111-1111-4111-8111-111111111111','google'),
 ('22222222-2222-4222-8222-222222222222','google');
insert into public.david_members(user_id,role,display_name) values
 ('11111111-1111-4111-8111-111111111111','worker','Worker One'),
 ('22222222-2222-4222-8222-222222222222','worker','Worker Two');
insert into public.david_worker_identities(user_id,active) values
 ('11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222222',true);
insert into public.david_companies(id,company_name,country,sector,assigned_to) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Old Contact','Bulgaria','Battery','22222222-2222-4222-8222-222222222222'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Current Company','Spain','Battery','11111111-1111-4111-8111-111111111111');
insert into public.david_manual_contact_results(company_id,worker_user_id,outcome,notes)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','interested','Private note from worker one');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare r jsonb; prior jsonb;
begin
 r:=public.david_operator_private_company_history('');
 if jsonb_array_length(r)<>2 then raise exception 'Reassigned private history missing: %',r;end if;
 select x into prior from jsonb_array_elements(r) x where x->>'company_id'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if prior->>'currently_assigned'<>'false' or jsonb_array_length(prior->'my_history')<>1
 then raise exception 'Past company must remain private but searchable';end if;
 if prior::text like '%contact_phone%' then raise exception 'Phone leaked';end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare r jsonb;
begin
 r:=public.david_operator_private_company_history('');
 if jsonb_array_length(r)<>1 or r::text like '%Private note from worker one%'
 then raise exception 'Cross-operator history leaked: %',r;end if;
end $$;
reset role;
