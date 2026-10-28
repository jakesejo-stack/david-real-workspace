-- DAVID Command Center: admin-only, real database analytics, no invented calls.
-- Uses internal SECURITY DEFINER only after authenticated Google ADMIN verification.
create or replace function public.david_admin_dashboard_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $fn$
declare
 v_now timestamptz:=now();
 v_out jsonb;
begin
 if not david_internal.david_is_admin() then
   raise exception 'Only two approved Google admins may access analytics'
      using errcode='42501';
 end if;
 select pg_catalog.jsonb_build_object(
  'ok',true,
  'generated_at',v_now,
  'period','all_time',
  'stats',pg_catalog.jsonb_build_object(
    'admins',(select count(*) from public.david_members m
       join public.david_worker_identities wi on wi.user_id=m.user_id
       where m.role='admin' and wi.active=true),
    'active_workers',(select count(*) from public.david_members m
       join public.david_worker_identities wi on wi.user_id=m.user_id
       where m.role='worker' and wi.active=true),
    'companies',(select count(*) from public.david_companies),
    'assigned_companies',(select count(*) from public.david_companies where assigned_to is not null),
    'calling_approved',(select count(*) from public.david_companies where calling_approved=true and do_not_call=false),
    'do_not_call',(select count(*) from public.david_companies where do_not_call=true),
    'calls',(select count(*) from public.david_call_logs),
    'completed_calls',(select count(*) from public.david_call_logs where call_status='completed'),
    'call_seconds',(select coalesce(sum(duration_seconds),0) from public.david_call_logs where call_status='completed'),
    'manual_contacts',(select count(*) from public.david_manual_contact_results),
    'interested',(select count(*) from public.david_manual_contact_results where outcome='interested'),
    'callbacks',(select count(*) from public.david_manual_contact_results where outcome='callback'),
    'recordings',(select count(*) from public.david_recordings),
    'tickets',(select count(*) from public.david_support_tickets),
    'open_tickets',(select count(*) from public.david_support_tickets where status<>'CLOSED'),
    'admin_tasks',(select count(*) from public.david_admin_tasks),
    'pending_tasks',(select count(*) from public.david_admin_tasks where status<>'DONE')
  ),
  'daily',(select coalesce(jsonb_agg(
    jsonb_build_object('date',d.day,
      'calls',(select count(*) from public.david_call_logs c
        where (c.started_at at time zone 'Europe/Sofia')::date=d.day),
      'manual',(select count(*) from public.david_manual_contact_results r
        where (r.created_at at time zone 'Europe/Sofia')::date=d.day),
      'interested',(select count(*) from public.david_manual_contact_results r
        where r.outcome='interested' and (r.created_at at time zone 'Europe/Sofia')::date=d.day)
    ) order by d.day),'[]'::jsonb)
    from (select ((v_now at time zone 'Europe/Sofia')::date - n) as day
      from generate_series(13,0,-1) as n) d),
  'workers',(select coalesce(jsonb_agg(jsonb_build_object(
     'user_id',u.id,'email',u.email,'name',m.display_name,'role',m.role,
     'active',wi.active,
     'assigned',(select count(*) from public.david_companies c where c.assigned_to=u.id),
     'calls',(select count(*) from public.david_call_logs l where l.worker_id=u.id),
     'manual',(select count(*) from public.david_manual_contact_results r where r.worker_user_id=u.id)
   ) order by m.role,u.email),'[]'::jsonb)
   from public.david_members m
   join auth.users u on u.id=m.user_id
   left join public.david_worker_identities wi on wi.user_id=m.user_id),
  'calls',(select coalesce(jsonb_agg(to_jsonb(c) order by c.started_at desc),'[]'::jsonb)
   from (select call_sid,company_id,worker_id,direction,call_status,duration_seconds,started_at
    from public.david_call_logs order by started_at desc limit 100)c),
  'manual',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
   from (select id,company_id,worker_user_id,channel,outcome,followup_at,created_at
    from public.david_manual_contact_results order by created_at desc limit 100)r),
  'companies',(select coalesce(jsonb_agg(to_jsonb(c) order by c.company_name),'[]'::jsonb)
   from (select id,company_name,country,sector,assigned_to,calling_approved,do_not_call
    from public.david_companies order by company_name limit 150)c),
  'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
   from (select id,company_id,title,status,severity,created_at
    from public.david_support_tickets order by created_at desc limit 80)t),
  'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
   from (select id,title,status,priority,assigned_to,source,due_at,created_at
    from public.david_admin_tasks order by created_at desc limit 100)t),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'at',a.at,'action',a.action,'company_id',a.company_id,
    'actor',coalesce(u.email,'system')
   ) order by a.at desc),'[]'::jsonb)
   from (select id,at,action,company_id,actor_id from public.david_audit_events
     order by at desc limit 60)a
    left join auth.users u on u.id=a.actor_id)
 ) into v_out;
 return v_out;
end;
$fn$;
revoke all on function public.david_admin_dashboard_snapshot() from public,anon;
grant execute on function public.david_admin_dashboard_snapshot() to authenticated;
