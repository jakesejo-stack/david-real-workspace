-- DAVID first-worker manual pilot, applied and SQL-rollback-tested on 2026-10-28.
-- No Twilio CallSid is generated for manual contacts.
alter table public.david_companies add column if not exists city text not null default '';
alter table public.david_companies add column if not exists contact_source text not null default '';
create table if not exists public.david_manual_contact_results(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.david_companies(id),
 worker_user_id uuid not null references auth.users(id),
 worker_id uuid not null references public.david_worker_identities(worker_id),
 organization_id uuid not null references public.david_organizations(id),
 channel text not null default 'manual_phone' check(channel='manual_phone'),
 outcome text not null check(outcome in ('no_answer','declined','interested','callback','do_not_contact')),
 notes text not null default '' check(length(notes)<=2000),
 followup_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists david_manual_contact_by_worker
 on public.david_manual_contact_results(worker_user_id,created_at desc);
create index if not exists david_manual_contact_by_company
 on public.david_manual_contact_results(company_id,created_at desc);
alter table public.david_manual_contact_results enable row level security;
revoke all on public.david_manual_contact_results from public,anon,authenticated;
grant select on public.david_manual_contact_results to authenticated;
drop policy if exists david_manual_contacts_admin_read on public.david_manual_contact_results;
create policy david_manual_contacts_admin_read on public.david_manual_contact_results
 for select to authenticated using(david_internal.david_is_admin());
drop policy if exists david_manual_contacts_worker_read on public.david_manual_contact_results;
create policy david_manual_contacts_worker_read on public.david_manual_contact_results
 for select to authenticated using(david_internal.david_is_active_member()
 and worker_user_id=(select auth.uid())
 and exists(select 1 from public.david_companies c where c.id=company_id and c.assigned_to=(select auth.uid())));
alter policy david_company_read on public.david_companies
 using (david_internal.david_is_active_member() and
 (david_internal.david_is_admin() or
 (assigned_to=(select auth.uid()) and exists(select 1 from public.david_members m
  where m.user_id=(select auth.uid()) and m.role='worker'))));

CREATE OR REPLACE FUNCTION public.david_admin_assign_company(p_company_id uuid, p_worker_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company public.david_companies%rowtype;v_worker public.david_worker_identities%rowtype;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 select * into v_company from public.david_companies where id=p_company_id for update;
 if not found then raise exception 'Company not found' using errcode='22023';end if;
 if p_worker_user_id is not null then
   select i.* into v_worker from public.david_worker_identities i
     join public.david_members m on m.user_id=i.user_id
     where i.user_id=p_worker_user_id and i.active=true and m.role in ('worker','admin');
   if not found then raise exception 'Worker must be explicitly active' using errcode='42501';end if;
 end if;
 if v_company.assigned_to is not distinct from p_worker_user_id then
   return jsonb_build_object('ok',true,'company_id',p_company_id,'unchanged',true);
 end if;
 if v_company.claimed_by is not null and v_company.claimed_until>now()
   and v_company.claimed_by is distinct from p_worker_user_id then
    raise exception 'Company is currently claimed by another worker' using errcode='42501';
 end if;
 update public.david_companies set assigned_to=p_worker_user_id,
  claimed_by=null,claimed_at=null,claimed_until=null,updated_at=now()
 where id=p_company_id;
 insert into public.david_audit_events(actor_id,action,company_id,details)
 values(auth.uid(),'company_assigned_to_worker',p_company_id,
   jsonb_build_object('worker_user_id',p_worker_user_id,'old_worker_user_id',v_company.assigned_to));
 return jsonb_build_object('ok',true,'company_id',p_company_id,'assigned_to',p_worker_user_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.david_record_manual_contact(p_company_id uuid, p_outcome text, p_notes text DEFAULT ''::text, p_followup_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_contact_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_identity public.david_worker_identities%rowtype;
 v_company public.david_companies%rowtype;v_id uuid;
begin
 if not david_internal.david_is_active_member() then raise exception 'Active worker required' using errcode='42501';end if;
 if p_contact_confirmed is distinct from true then raise exception 'Confirm the actual manual contact attempt' using errcode='22023';end if;
 select * into v_identity from public.david_worker_identities where user_id=v_uid and active=true;
 if not found then raise exception 'Worker identity missing' using errcode='42501';end if;
 if p_outcome not in ('no_answer','declined','interested','callback','do_not_contact')
   or length(coalesce(p_notes,''))>2000
   or (p_followup_at is not null and
    (p_followup_at<=now() or p_followup_at>now()+interval '365 days'))
 then raise exception 'Invalid contact outcome or follow-up' using errcode='22023';end if;
 if p_outcome='callback' and p_followup_at is null then
   raise exception 'Callback requires future follow-up time' using errcode='22023';end if;
 select * into v_company from public.david_companies where id=p_company_id for update;
 if not found or v_company.assigned_to is distinct from v_uid then
   raise exception 'Company not assigned to this operator' using errcode='42501';end if;
 if v_company.do_not_call or not v_company.calling_approved
   or v_company.contact_phone !~ '^\+[1-9][0-9]{5,14}$' then
   raise exception 'Phone/contact permission not approved' using errcode='42501';end if;
 if length(trim(v_company.contact_source))<5 then
   raise exception 'Documented source of business phone is required' using errcode='42501';end if;
 insert into public.david_manual_contact_results(company_id,worker_user_id,worker_id,
  organization_id,outcome,notes,followup_at)
 values(v_company.id,v_uid,v_identity.worker_id,v_identity.organization_id,
  p_outcome,coalesce(p_notes,''),p_followup_at) returning id into v_id;
 if p_outcome='do_not_contact' then
   update public.david_companies set do_not_call=true,calling_approved=false,
     updated_at=now() where id=v_company.id;
 end if;
 insert into public.david_audit_events(actor_id,action,company_id,details)
 values(v_uid,'manual_contact_outcome_recorded',v_company.id,
  jsonb_build_object('manual_result_id',v_id,'outcome',p_outcome,
    'worker_id',v_identity.worker_id,'followup_at',p_followup_at));
 return jsonb_build_object('ok',true,'record_id',v_id,'company_id',v_company.id,
   'worker_id',v_identity.worker_id,'channel','manual_phone','twilio_call_sid',null,
   'outcome',p_outcome,'do_not_call',p_outcome='do_not_contact');
end;
$function$;

CREATE OR REPLACE FUNCTION public.david_admin_update_business_contact(p_company_id uuid, p_city text, p_business_phone text, p_phone_source text, p_approve_manual_contact boolean DEFAULT false, p_verified_by_admin boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company public.david_companies%rowtype;
 v_city text:=trim(coalesce(p_city,''));v_phone text:=trim(coalesce(p_business_phone,''));
 v_source text:=trim(coalesce(p_phone_source,''));
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if length(v_city)>100 or length(v_source)>1000
   or (v_phone<>'' and v_phone !~ '^\+[1-9][0-9]{5,14}$')
   or (v_phone<>'' and length(v_source)<5) then
    raise exception 'Invalid business contact or missing documented source' using errcode='22023';
 end if;
 select * into v_company from public.david_companies where id=p_company_id for update;
 if not found then raise exception 'Company not found' using errcode='22023';end if;
 if p_approve_manual_contact and (p_verified_by_admin is distinct from true
   or v_phone='' or length(v_source)<5 or v_company.do_not_call) then
    raise exception 'Manual contact requires verified public business phone, source and opt-out check'
       using errcode='42501';
 end if;
 update public.david_companies set
 city=v_city,contact_phone=v_phone,contact_source=v_source,
 calling_approved=(p_approve_manual_contact and not do_not_call),
 updated_at=now() where id=p_company_id;
 insert into public.david_audit_events(actor_id,action,company_id,details)
 values(auth.uid(),'business_phone_contact_updated',p_company_id,
   jsonb_build_object('manually_approved',p_approve_manual_contact,
      'has_source',length(v_source)>=5,'has_phone',v_phone<>''));
 return jsonb_build_object('ok',true,'company_id',p_company_id,
   'calling_approved',p_approve_manual_contact and not v_company.do_not_call);
end;
$function$;

revoke all on function public.david_admin_assign_company(uuid,uuid) from public,anon;
grant execute on function public.david_admin_assign_company(uuid,uuid) to authenticated;
revoke all on function public.david_record_manual_contact(uuid,text,text,timestamptz,boolean) from public,anon;
grant execute on function public.david_record_manual_contact(uuid,text,text,timestamptz,boolean) to authenticated;
revoke all on function public.david_admin_update_business_contact(uuid,text,text,text,boolean,boolean) from public,anon;
grant execute on function public.david_admin_update_business_contact(uuid,text,text,text,boolean,boolean) to authenticated;
