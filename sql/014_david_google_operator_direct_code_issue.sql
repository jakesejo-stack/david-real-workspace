-- P3 real code issuance, tested with Google-linked admin in rollback transaction.
CREATE OR REPLACE FUNCTION public.david_generate_link_code()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 v_random bytea;
 v_code text:='#';
 v_hash text;
 v_role text;
 v_generated jsonb;
 v_index int;
begin
 if v_uid is null or not david_internal.david_is_active_member() then
   raise exception 'Approved active operator required' using errcode='42501';
 end if;
 if not exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null
   and u.raw_app_meta_data->'providers' ? 'google'
   and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')) then
   raise exception 'Verified Google identity required' using errcode='42501';
 end if;
 select m.role into v_role from public.david_members m where m.user_id=v_uid;
 if v_role not in ('admin','worker') then raise exception 'Approved worker membership required' using errcode='42501';end if;
 v_random:=extensions.gen_random_bytes(12);
 for v_index in 0..11 loop
   v_code:=v_code||substr(v_alphabet,(pg_catalog.get_byte(v_random,v_index)%32)+1,1);
 end loop;
 v_code:=v_code||'!';
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_code,'UTF8')),'hex');
 v_generated:=public.david_issue_link_code(v_hash);
 return v_generated||pg_catalog.jsonb_build_object('code',v_code,'active',true,'sync_complete',false);
end;
$function$;
revoke all on function public.david_generate_link_code() from public,anon;
grant execute on function public.david_generate_link_code() to authenticated;
