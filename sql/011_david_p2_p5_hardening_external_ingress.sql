-- Versioned verified DAVID P2/P5 migration; existing deployed database already contains these objects.
-- Apply only after comparing target environment schema.
create table if not exists public.david_external_org_links(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.david_organizations(id),
 company_id uuid not null references public.david_companies(id) on delete cascade,
 source_system text not null check(source_system in ('dpp_autopilot','soulflame_twins')),
 external_org_id text not null check(length(external_org_id) between 1 and 256),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,source_system,external_org_id)
);
alter table public.david_external_org_links enable row level security;
revoke all on public.david_external_org_links from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.david_admin_link_external_org(p_company_id uuid, p_source_system text, p_external_org_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;v_id uuid;v_existing uuid;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if p_source_system not in ('dpp_autopilot','soulflame_twins')
 or length(trim(coalesce(p_external_org_id,''))) not between 1 and 256 then raise exception 'Invalid mapping';end if;
 if not exists(select 1 from public.david_companies where id=p_company_id) then raise exception 'Unknown CRM company';end if;
 select id into v_org from public.david_organizations where slug='soulflame';
 select company_id into v_existing from public.david_external_org_links
 where organization_id=v_org and source_system=p_source_system and external_org_id=p_external_org_id;
 if v_existing is not null and v_existing<>p_company_id then
 raise exception 'External organization already maps to another CRM company';
 end if;
 insert into public.david_external_org_links(organization_id,company_id,source_system,external_org_id,created_by)
 values(v_org,p_company_id,p_source_system,trim(p_external_org_id),auth.uid())
 on conflict(organization_id,source_system,external_org_id) do update set company_id=excluded.company_id
 returning id into v_id;
 insert into public.david_audit_events(actor_id,action,company_id,details)
 values(auth.uid(),'external_organization_linked',p_company_id,
 jsonb_build_object('source_system',p_source_system,'link_id',v_id));
 return jsonb_build_object('ok',true,'link_id',v_id,'company_id',p_company_id);
end;$function$;

CREATE OR REPLACE FUNCTION public.david_ingest_external_support_ticket(p_source_system text, p_external_org_id text, p_external_ticket_id text, p_title text, p_description text DEFAULT ''::text, p_category text DEFAULT 'bug'::text, p_severity text DEFAULT 'S3'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_link public.david_external_org_links%rowtype;v_id uuid;v_new boolean:=false;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
 raise exception 'Service only' using errcode='42501';end if;
 if p_source_system not in ('dpp_autopilot','soulflame_twins')
 or length(trim(coalesce(p_external_org_id,''))) not between 1 and 256
 or length(trim(coalesce(p_external_ticket_id,''))) not between 1 and 256
 or length(trim(coalesce(p_title,''))) not between 4 and 200
 or length(coalesce(p_description,''))>6000
 or p_category not in ('qr','passport','document','account','bug','payment','integration','other')
 or p_severity not in ('S1','S2','S3','S4')
 then raise exception 'Invalid event' using errcode='22023';end if;
 select * into v_link from public.david_external_org_links
 where source_system=p_source_system and external_org_id=p_external_org_id;
 if not found then raise exception 'External organization not registered' using errcode='42501';end if;
 insert into public.david_support_tickets(
  company_id,organization_id,external_org_id,external_ticket_id,source_system,
  category,severity,title,description)
 values(v_link.company_id,v_link.organization_id,p_external_org_id,p_external_ticket_id,
  p_source_system,p_category,p_severity,trim(p_title),coalesce(p_description,''))
 on conflict(source_system,external_ticket_id) where external_ticket_id is not null do nothing
 returning id into v_id;
 if v_id is not null then
  v_new:=true;
  insert into public.david_support_ticket_events(ticket_id,actor_id,action,note)
  values(v_id,null,'RECEIVED','Authenticated external event; pending admin triage');
 else
  select id into v_id from public.david_support_tickets
  where source_system=p_source_system and external_ticket_id=p_external_ticket_id
  and organization_id=v_link.organization_id and company_id=v_link.company_id;
  if v_id is null then raise exception 'Ticket ID collision across organization' using errcode='42501';end if;
 end if;
 return jsonb_build_object('ok',true,'ticket_id',v_id,'created',v_new);
end;$function$;

CREATE OR REPLACE FUNCTION public.david_admin_set_worker_active(p_user_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;v_identity public.david_worker_identities%rowtype;v_role text;
begin
 if auth.uid() is null or not david_internal.david_is_admin() then
   raise exception 'Admin required' using errcode='42501';end if;
 select role into v_role from public.david_members where user_id=p_user_id;
 if v_role not in ('worker','admin') or v_role is null then
   raise exception 'Approved membership required' using errcode='42501';end if;
 if not p_active and v_role='admin'
   and (select count(*) from public.david_worker_identities i
   join public.david_members m on m.user_id=i.user_id
   where i.active=true and m.role='admin')<=1 then
     raise exception 'Cannot deactivate the last active administrator' using errcode='42501';
 end if;
 select id into v_org from public.david_organizations where slug='soulflame';
 insert into public.david_worker_identities(user_id,organization_id,active)
 values(p_user_id,v_org,p_active)
 on conflict(user_id) do update set active=excluded.active,updated_at=now();
 select * into v_identity from public.david_worker_identities where user_id=p_user_id;
 if not p_active then
  update public.david_link_codes set status='revoked'
  where worker_id=v_identity.worker_id and status='issued';
  update public.david_worker_links set revoked_at=now()
  where worker_id=v_identity.worker_id and revoked_at is null;
 end if;
 insert into public.david_audit_events(actor_id,action,details)
 values(auth.uid(),case when p_active then 'worker_enabled' else 'worker_disabled' end,
 jsonb_build_object('worker_id',v_identity.worker_id,'role',v_role));
 return jsonb_build_object('worker_id',v_identity.worker_id,
 'organization_id',v_org,'active',p_active);
end;$function$;

CREATE OR REPLACE FUNCTION public.david_admin_invite_worker(p_email text, p_name text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text:=lower(trim(coalesce(p_email,'')));v_id uuid;
begin
 if not david_internal.david_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if length(v_email) not between 5 and 254
 or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
 or length(coalesce(p_name,''))>150 then raise exception 'Invalid invitation';end if;
 if v_email in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com')
 then raise exception 'Reserved administrator identity';end if;
 if exists(select 1 from public.david_worker_invites
   where email=v_email and status='active') then
   raise exception 'Worker already approved';end if;
 insert into public.david_worker_invites(email,display_name,invited_by)
 values(v_email,trim(coalesce(p_name,'')),auth.uid())
 on conflict(email) do update set status='pending',invited_by=auth.uid(),
 display_name=excluded.display_name,updated_at=now()
 returning id into v_id;
 insert into public.david_audit_events(actor_id,action,details)
 values(auth.uid(),'worker_invited',jsonb_build_object('invite_id',v_id));
 return jsonb_build_object('ok',true,'invite_id',v_id,'status','pending');
end;$function$;

CREATE OR REPLACE FUNCTION public.david_admin_update_ticket(p_ticket_id uuid, p_status text, p_worker_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ticket public.david_support_tickets%rowtype;
begin
 if not david_internal.david_is_admin() then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status not in ('NEW','TRIAGED','ASSIGNED','IN_PROGRESS','NEEDS_INFO','FIX_IN_REVIEW','VERIFIED','CLOSED','REOPENED') then
 raise exception 'Invalid ticket status';end if;
 select * into v_ticket from public.david_support_tickets where id=p_ticket_id for update;
 if not found then raise exception 'Ticket not found';end if;
 if p_worker_id is not null and not exists(
 select 1 from public.david_worker_identities i
 join public.david_members m on m.user_id=i.user_id
 where i.worker_id=p_worker_id and i.active=true and i.organization_id=v_ticket.organization_id
 and m.role in ('worker','admin')) then raise exception 'Worker not eligible';end if;
 update public.david_support_tickets set status=p_status,assigned_worker_id=p_worker_id,
 updated_at=now(),closed_at=case when p_status='CLOSED' then now() else null end
 where id=p_ticket_id;
 insert into public.david_support_ticket_events(ticket_id,actor_id,action,note)
 values(p_ticket_id,auth.uid(),'STATUS_CHANGED','State updated by administrator');
 return jsonb_build_object('ok',true,'ticket_id',p_ticket_id,'status',p_status);
end;$function$;

revoke all on function public.david_admin_link_external_org(uuid,text,text) from public,anon;
grant execute on function public.david_admin_link_external_org(uuid,text,text) to authenticated;
revoke all on function public.david_ingest_external_support_ticket(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.david_ingest_external_support_ticket(text,text,text,text,text,text,text) to service_role;
