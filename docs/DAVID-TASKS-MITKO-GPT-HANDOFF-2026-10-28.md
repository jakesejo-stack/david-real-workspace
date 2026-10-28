# DAVID Tasks × Mitko GPT | handoff 2026-10-28

## Current verified state
- Supabase project: `lyyqfpbrgjsxdqukwurl` (DAVID Real Workspace, not a different DPP database).
- `soulflame.mitko@gmail.com`: verified Google identity, active admin, verified by SQL in production.
- `soulflame.dpp@gmail.com`: explicitly added to exact admin allowlist; no auth.users registration yet. It must authenticate with Google. Backend cannot mark it as a currently active user until first sign-in.
- Existing DPP support tickets remain company-specific and unchanged.
- Shared admin task exchange deployed in Supabase: `public.david_admin_tasks`, `public.david_admin_task_comments`.
- Both tables have enabled RLS, admin-scoped read/write, no `anon` grants. Comments immutable. All tasks currently empty: no real human/GPT task posted yet.
- Minimal GUI module exists: `src/david-admin-task-board.js`; it is **NOT mounted in live Vercel** because original editable Vite source is incomplete in this GitHub repo. Do not redeploy an incomplete clone over production.
- No direct GPT-to-GPT transport, Mitko GPT connector, OAuth credential sharing, API key, Twilio, or worker call has been enabled by these migrations.

## Connect Mitko's ChatGPT safely
1. Mitko must have explicit permission to access this specific Supabase project, granted by the Supabase organization owner from the Dashboard as appropriate. His Call Desk Google Admin login **does not** grant Supabase Dashboard or ChatGPT connector access.
2. On Mitko's own ChatGPT account, connect the **Supabase plugin** in Settings > Plugins, authorize using **his own** Supabase account. Choose/verify the intended DAVID project (ref above). Do not share a service-role secret, GitHub personal token, or browser JWT in chat.
3. Restrict GPT instructions to the two admin task tables only and read-only status of assigned DPP support tickets when relevant. Any change to RLS, users, billing, production deploys, calls or company data requires separate explicit approval.
4. Only create tasks the human actually requests. Give each task a concrete title, description, assigned admin (optional), priority P0-P3, due date when specified, and `source='mitko_gpt'`. On behalf of Mitko, `created_by` must identify his actual verified admin identity; don't fabricate other authors. Prefer unique `external_request_id` to avoid repeats.
5. Record conversation context in task comments and update task status `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`. Never claim an external job has been completed from just creating the task row.
6. Show the created task ID and read it back after each write. Never assume connector success. If connector cannot authenticate, stop and ask for an authorized connection, not secret keys.

## Safe prompt for Mitko to paste into his ChatGPT
> Работи само в Supabase проект `lyyqfpbrgjsxdqukwurl` по DAVID Admin Tasks. За задачи ползвай `public.david_admin_tasks`, за коментари `public.david_admin_task_comments`. Преглеждай и създавай само изрично възложени задачи. Пиши реален отговорник, приоритет, статус и резултат; при твоя GPT поставяй `source='mitko_gpt'`. Не измисляй обаждания, записвания, фирми, приключени задачи или клиентски резултати. Без миграции, роли, secrets, live call/Twilio, merge или deployment без изрично одобрение. След всяко записване провери в базата и върни ID.

## Current readiness
Backend SQL and rollback synthetic fixture: PASS. Security policies and grants readback: PASS. Real Mitko ChatGPT connector + Google-admin API end-to-end, browser task UI and third Gmail login: **PENDING**.
