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
end;$function$
;
revoke all on function public.david_admin_update_ticket(uuid,text,uuid) from public,anon;
grant execute on function public.david_admin_update_ticket(uuid,text,uuid) to authenticated;
