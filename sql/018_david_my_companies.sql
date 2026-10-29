-- Worker private searchable CRM. Past contacts remain visible after reassignment,
-- but only this operator's own notes are returned; no current phone for past companies.
create or replace function public.david_worker_my_companies(p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_data jsonb;v_query text:=lower(trim(coalesce(p_query,'')));
begin
 if not david_internal.david_is_active_member() or
 not exists(select 1 from public.david_members m where m.user_id=v_uid and m.role='worker')
 then raise exception 'Active operator required' using errcode='42501';end if;
 if length(v_query)>120 then raise exception 'Query too long' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'company_id',x.id,'company_name',x.company_name,'country',x.country,
 'sector',x.sector,'currently_assigned',x.assigned_to=v_uid,
 'my_contact_count',x.my_count,'last_contact_at',x.last_at,'last_outcome',x.last_outcome)
 order by x.last_at desc nulls last,x.company_name),'[]'::jsonb) into v_data
 from (
 select c.id,c.company_name,c.country,c.sector,c.assigned_to,
 (select count(*) from public.david_company_interactions j
  where j.company_id=c.id and j.worker_user_id=v_uid) as my_count,
 (select j.created_at from public.david_company_interactions j where j.company_id=c.id
  and j.worker_user_id=v_uid order by j.created_at desc limit 1) as last_at,
 (select j.outcome from public.david_company_interactions j where j.company_id=c.id
  and j.worker_user_id=v_uid order by j.created_at desc limit 1) as last_outcome
 from public.david_companies c where (
  c.assigned_to=v_uid or exists(select 1 from public.david_company_interactions j
   where j.company_id=c.id and j.worker_user_id=v_uid))
 and (v_query='' or lower(c.company_name) like '%'||v_query||'%'
 or lower(c.country) like '%'||v_query||'%'
 or lower(c.sector) like '%'||v_query||'%')
 order by c.company_name limit 150
 ) x;
 return v_data;
end $$;
revoke all on function public.david_worker_my_companies(text) from public,anon;
grant execute on function public.david_worker_my_companies(text) to authenticated;
