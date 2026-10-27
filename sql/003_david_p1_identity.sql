-- P1 canonical identity and cross-system mapping schema.

create table if not exists public.david_organizations(
 id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null,created_at timestamptz not null default now());
insert into public.david_organizations(slug,name) values('soulflame','SoulFlame DPP') on conflict(slug) do nothing;
create table if not exists public.david_worker_identities(
 worker_id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
 organization_id uuid not null references public.david_organizations(id),active boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
insert into public.david_worker_identities(user_id,organization_id,active)
select m.user_id,o.id,true from public.david_members m cross join public.david_organizations o where m.role='admin' and o.slug='soulflame'
on conflict(user_id) do nothing;
create table if not exists public.david_link_codes(
 id uuid primary key default gen_random_uuid(),worker_id uuid not null references public.david_worker_identities(worker_id),
 code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz not null default now(),expires_at timestamptz not null,
 status text not null default 'issued' check(status in ('issued','redeemed','revoked')),redeemed_at timestamptz,
 check(expires_at>issued_at));
create index if not exists david_codes_by_worker on public.david_link_codes(worker_id,issued_at desc);
create table if not exists public.david_worker_links(
 id uuid primary key default gen_random_uuid(),worker_id uuid not null references public.david_worker_identities(worker_id),
 organization_id uuid not null references public.david_organizations(id),provider text not null default 'david_os' check(provider='david_os'),
 external_user_id text not null check(char_length(external_user_id) between 1 and 256),linked_at timestamptz not null default now(),
 last_verified_at timestamptz,revoked_at timestamptz);
create unique index if not exists david_active_link_by_worker on public.david_worker_links(worker_id,provider) where revoked_at is null;
create unique index if not exists david_active_link_by_external on public.david_worker_links(organization_id,provider,external_user_id) where revoked_at is null;
create table if not exists public.david_link_attempts(
 id bigint generated always as identity primary key,external_user_id text not null,attempted_at timestamptz not null default now(),
 result text not null check(result in ('invalid','rate_limited','redeemed','rejected')));
create index if not exists david_attempts_by_external on public.david_link_attempts(external_user_id,attempted_at desc);
create table if not exists public.david_company_external_mappings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.david_organizations(id),
 company_id uuid not null references public.david_companies(id) on delete cascade,
 external_system text not null check(external_system in ('soulflame_twins','dpp_autopilot','david_os')),
 external_company_id text not null check(length(external_company_id) between 1 and 256),created_at timestamptz not null default now(),
 unique(organization_id,company_id,external_system),unique(organization_id,external_system,external_company_id));
alter table public.david_organizations enable row level security;
alter table public.david_worker_identities enable row level security;
alter table public.david_link_codes enable row level security;
alter table public.david_worker_links enable row level security;
alter table public.david_link_attempts enable row level security;
alter table public.david_company_external_mappings enable row level security;
create policy david_worker_identity_self_read on public.david_worker_identities
for select to authenticated using(user_id=(select auth.uid()));
create policy david_worker_links_self_read on public.david_worker_links
for select to authenticated using(worker_id in(select i.worker_id from public.david_worker_identities i where i.user_id=(select auth.uid())));
revoke all on public.david_link_codes,public.david_link_attempts,public.david_company_external_mappings,public.david_organizations from anon,authenticated;
revoke all on public.david_worker_links,public.david_worker_identities from anon;
grant select on public.david_worker_identities,public.david_worker_links to authenticated;
