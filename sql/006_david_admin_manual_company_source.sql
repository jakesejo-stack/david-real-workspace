-- Admin-only manual import from referenced Mitko/DAVID emails. No autonomous Gmail sync.

create or replace function public.david_admin_add_company_from_message(
 p_company_name text, p_country text,p_sector text default '',
 p_contact_email text default '',p_research_notes text default '',
 p_source_from text default '',p_email_subject text default '',
 p_source_url text default '',p_source_note text default ''
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_name text:=trim(coalesce(p_company_name,''));
 v_country text:=trim(coalesce(p_country,''));
 v_sector text:=trim(coalesce(p_sector,''));
 v_email text:=lower(trim(coalesce(p_contact_email,'')));
 v_src text:=trim(coalesce(p_source_url,''));
 v_sender text:=trim(coalesce(p_source_from,''));
 v_subject text:=trim(coalesce(p_email_subject,''));
 v_note text:=trim(coalesce(p_source_note,''));
 v_research text:=trim(coalesce(p_research_notes,''));
 v_id uuid;
 v_source_id text;
begin
 if auth.uid() is null or not david_internal.david_is_admin() then
  raise exception 'Admin only' using errcode='42501';end if;
 if char_length(v_name) not between 2 and 150 or char_length(v_country) not between 2 and 100
 or char_length(v_sector)>150 or char_length(v_email)>254 or char_length(v_sender)>254
 or char_length(v_subject)>300 or char_length(v_src)>1500 or char_length(v_note)>1000
 or char_length(v_research)>2000 then
  raise exception 'Invalid input length' using errcode='22023';end if;
 if v_email<>'' and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then
  raise exception 'Invalid contact email' using errcode='22023';end if;
 if v_src<>'' and v_src !~* '^https://[^[:space:]]+$' then
  raise exception 'Source link must be HTTPS' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(lower(v_name)||'|'||lower(v_country)));
 if exists(select 1 from public.david_companies c where lower(trim(c.company_name))=lower(v_name)
     and lower(trim(c.country))=lower(v_country)) then
  raise exception 'Company already exists for country' using errcode='23505';end if;
 insert into public.david_companies(
 company_name,country,sector,contact_email,research_notes,task,
 calling_approved,do_not_call
 )values(v_name,v_country,v_sector,v_email,v_research,
 'Провери източника и подготви разговор. Не набирай без изрично разрешение.',
 false,false)
 returning id into v_id;
 v_source_id:='manual:'||v_id::text;
 insert into public.david_company_sources(
 company_id,source_type,source_id,email_state,email_subject,source_from,
 source_url,source_note,imported_by
 )values(v_id,'manual',v_source_id,'internal',v_subject,v_sender,v_src,
 'Ръчно въведено от администратор. Няма автоматична Gmail верификация. '||v_note,auth.uid());
 return jsonb_build_object('ok',true,'company_id',v_id,'company_name',v_name,
  'country',v_country,'source_id',v_source_id,'calling_approved',false);
end;$$;
revoke all on function public.david_admin_add_company_from_message(text,text,text,text,text,text,text,text,text)
 from public,anon;
grant execute on function public.david_admin_add_company_from_message(text,text,text,text,text,text,text,text,text)
 to authenticated;
