-- P5 worker DPP report issue: already applied and rollback-tested in DAVID Call Desk.
CREATE OR REPLACE FUNCTION public.david_worker_report_issue(p_company_id uuid, p_title text, p_description text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_identity public.david_worker_identities%rowtype;v_company public.david_companies%rowtype;v_role text;v_id uuid;
begin
 if v_uid is null or not david_internal.david_is_active_member() then
  raise exception 'Active operator required' using errcode='42501';end if;
 select role into v_role from public.david_members where user_id=v_uid;
 if v_role not in ('worker','admin') then raise exception 'Approved operator required' using errcode='42501';end if;
 select * into v_identity from public.david_worker_identities where user_id=v_uid and active=true;
 if not found then raise exception 'Worker identity missing' using errcode='42501';end if;
 select * into v_company from public.david_companies where id=p_company_id;
 if not found or v_company.assigned_to is distinct from v_uid then
  raise exception 'Company not assigned to this operator' using errcode='42501';end if;
 if length(trim(coalesce(p_title,''))) not between 4 and 200
 or length(coalesce(p_description,''))>6000 then raise exception 'Invalid ticket' using errcode='22023';end if;
 insert into public.david_support_tickets(company_id,organization_id,title,description,category,severity,
  assigned_worker_id,created_by,source_system)
 values(v_company.id,v_identity.organization_id,trim(p_title),coalesce(p_description,''),'bug','S3',
  v_identity.worker_id,v_uid,'operator') returning id into v_id;
 insert into public.david_support_ticket_events(ticket_id,actor_id,action,note)
 values(v_id,v_uid,'REPORTED','Operator-submitted issue for assigned company');
 return jsonb_build_object('ok',true,'ticket_id',v_id,'status','NEW');
end; $function$;
revoke all on function public.david_worker_report_issue(uuid,text,text) from public,anon;
grant execute on function public.david_worker_report_issue(uuid,text,text) to authenticated;
