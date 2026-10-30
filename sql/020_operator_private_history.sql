-- Safe, redacted private history of self-reported manual CRM outcomes.
-- No changes to existing table RLS, ownership, assignments or stored records.
create or replace function public.david_operator_private_company_history(
 p_query text default ''
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_q text:=lower(btrim(coalesce(p_query,''))); v_out jsonb;
begin
 if v_uid is null or not david_internal.david_is_active_member()
   or not exists(
     select 1 from public.david_members m
     join auth.users u on u.id=m.user_id
     where m.user_id=v_uid and m.role='worker' and u.email_confirmed_at is not null
       and exists(select 1 from auth.identities ai where ai.user_id=v_uid and ai.provider='google')
   ) then
  raise exception 'Approved Google operator required' using errcode='42501';
 end if;
 if length(v_q)>120 then raise exception 'Search too long' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
    'company_id',c.id,'name',c.company_name,'country',c.country,'sector',c.sector,
    'currently_assigned',c.assigned_to=v_uid,
    'my_contact_count',(select count(*) from public.david_manual_contact_results r
       where r.company_id=c.id and r.worker_user_id=v_uid),
    'my_history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc),'[]'::jsonb)
       from (select r.outcome,r.notes,r.created_at,r.followup_at
         from public.david_manual_contact_results r
         where r.company_id=c.id and r.worker_user_id=v_uid
         order by r.created_at desc limit 30) h)
 ) order by c.company_name),'[]'::jsonb)
 into v_out
 from (select id,company_name,country,sector,assigned_to
   from public.david_companies c
   where (c.assigned_to=v_uid or exists(select 1 from public.david_manual_contact_results r
      where r.company_id=c.id and r.worker_user_id=v_uid))
    and (v_q='' or lower(coalesce(c.company_name,'')) like '%'||v_q||'%'
      or lower(coalesce(c.country,'')) like '%'||v_q||'%'
      or lower(coalesce(c.sector,'')) like '%'||v_q||'%')
   order by c.company_name limit 150) c;
 return v_out;
end $$;
revoke all on function public.david_operator_private_company_history(text) from public,anon;
grant execute on function public.david_operator_private_company_history(text) to authenticated;
