-- DAVID live sales review, idempotent after existing live call tables.
-- The operator sees text and notes; audio access is enforced by server-side admin checks.
create table if not exists public.david_live_call_outcomes (
 call_sid text primary key references public.david_live_call_sessions(call_sid) on delete cascade,
 company_id uuid not null references public.david_companies(id) on delete cascade,
 worker_user_id uuid not null references auth.users(id) on delete cascade,
 disposition text not null check(disposition in ('no_answer','neutral','early_access')),
 notes text not null default '' check(char_length(notes)<=3000),
 saved_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists david_live_outcome_company_idx on public.david_live_call_outcomes(company_id,saved_at desc);
create index if not exists david_live_outcome_worker_idx on public.david_live_call_outcomes(worker_user_id,saved_at desc);
alter table public.david_live_call_outcomes enable row level security;
revoke all on public.david_live_call_outcomes from anon,authenticated;

create table if not exists public.david_admin_call_inbox_reads (
 admin_user_id uuid not null references auth.users(id) on delete cascade,
 call_sid text not null references public.david_live_call_sessions(call_sid) on delete cascade,
 chat_seen_at timestamptz,
 audio_seen_at timestamptz,
 primary key(admin_user_id,call_sid)
);
alter table public.david_admin_call_inbox_reads enable row level security;
revoke all on public.david_admin_call_inbox_reads from anon,authenticated;
