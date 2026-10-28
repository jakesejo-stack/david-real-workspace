-- P2.7 legacy membership revocation alignment, applied to DAVID Call Desk on 2026-10-28.
-- Dynamically preserves existing policy predicates and existing function bodies.
create or replace function david_internal.david_is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.david_worker_identities wi
  join public.david_members m on m.user_id=wi.user_id
  join auth.users u on u.id=wi.user_id
  where wi.user_id=(select auth.uid()) and wi.active=true
    and m.role in ('worker','admin') and u.email_confirmed_at is not null);
$$;
revoke all on function david_internal.david_is_active_member() from public,anon;
grant execute on function david_internal.david_is_active_member() to authenticated,service_role;
create or replace function david_internal.david_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.david_members m
  join auth.users u on u.id=m.user_id
  join public.david_worker_identities wi on wi.user_id=m.user_id and wi.active
  where m.user_id=(select auth.uid()) and m.role='admin'
   and u.email_confirmed_at is not null
   and lower(u.email) in ('borquitokonsejo@gmail.com','soulflame.mitko@gmail.com'));
$$;
do $$
declare p record; v_new text;
begin
 for p in select * from pg_policies
   where schemaname='public'
     and tablename in ('david_members','david_companies','david_call_logs','david_outcomes')
     and cmd in ('SELECT','INSERT','UPDATE','DELETE','ALL')
 loop
  if p.qual is not null and position('david_internal.david_is_active_member()' in p.qual)=0 then
    v_new:=format('alter policy %I on public.%I using ((%s) and david_internal.david_is_active_member())',
      p.policyname,p.tablename,p.qual);
    if p.with_check is not null then
      v_new:=v_new||format(' with check ((%s) and david_internal.david_is_active_member())',p.with_check);
    end if;
    execute v_new;
  elsif p.qual is null and p.with_check is not null
    and position('david_internal.david_is_active_member()' in p.with_check)=0 then
    execute format('alter policy %I on public.%I with check ((%s) and david_internal.david_is_active_member())',
     p.policyname,p.tablename,p.with_check);
  end if;
 end loop;
end;
$$;
do $$
declare n text;src text;dst text;
begin
 foreach n in array array['david_claim_company','david_prepare_company','david_release_company','david_preparation_queue']
 loop
  src:=pg_get_functiondef(('public.'||n||
    case when n='david_preparation_queue' then '(text)' else '(uuid)' end)::regprocedure);
  if position('david_internal.david_is_active_member()' in src)=0 then
    dst:=replace(src,'begin'||chr(10),'begin'||chr(10)||
     ' if not david_internal.david_is_active_member() then raise exception ''Worker inactive'' using errcode=''42501''; end if;'||chr(10));
    if src=dst then raise exception 'Cannot patch %',n;end if;
    execute dst;
  end if;
 end loop;
end;
$$;
do $$
declare src text;dst text;
begin
 src:=pg_get_functiondef('public.david_reserve_voice_budget(text,uuid,uuid,numeric)'::regprocedure);
 if position('worker is no longer active' in src)=0 then
  dst:=replace(src,
   ' select m.role into v_role from public.david_members m where m.user_id=p_worker_id;',
   ' if not exists (select 1 from public.david_worker_identities wi join public.david_members mm on mm.user_id=wi.user_id where wi.user_id=p_worker_id and wi.active=true and mm.role in (''admin'',''worker'')) then raise exception ''worker is no longer active''; end if;'||chr(10)||
   ' select m.role into v_role from public.david_members m where m.user_id=p_worker_id;');
  if src=dst then raise exception 'Cannot patch voice budget';end if;
  execute dst;
 end if;
end;
$$;
