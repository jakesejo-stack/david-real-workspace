-- Encrypted personal Gemini API keys. Never expose ciphertext through client Data API.
create table if not exists public.david_operator_gemini_keys (
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_key text not null,
 updated_at timestamptz not null default now()
);
alter table public.david_operator_gemini_keys enable row level security;
revoke all on public.david_operator_gemini_keys from public,anon,authenticated;
-- Only trusted server-side service-role accesses this table after verifying the Google user.
