# First DPP worker MVP | 2026-10-28 (preview-only proposal)

## Priority
Mitko's latest email (28 October) explicitly prioritizes one human operator with manual dialing and truthful CRM outcomes **before** Live DAVID/Twilio. The P0-P12 master plan remains unchanged.

## Ground truth
- DAVID Call Desk Supabase project: `lyyqfpbrgjsxdqukwurl` (not the separate `DAVID` project).
- Production Vercel project: `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`.
- Active workspace: https://david-real-workspace.vercel.app/
- DAVID OS: https://david-os-rust.vercel.app/work (NOT accessible through linked GitHub/Vercel connections, employee code login DISABLED).
- Current DB snapshot (2026-10-28): 5 CRM firms, 0 invitations, 0 actual calls, 0 manual results; no real first worker.
- This repository still lacks the full original Vite source. **Do not connect it to or replace production.** The isolated UI module is not mounted into production.
- Repository currently PUBLIC: commit no company datasets, user records, phone lists, tokens or env secrets.

## Files proposed in this draft PR
1. `sql/015_first_worker_manual_activity.sql`: additive manual activity ledger and role-scoped, idempotent result RPC. No call SID fabrication. Audit event once. Worker opt-out sets `do_not_call`.
2. `src/david-first-worker-manual-pilot.js`: mobile-friendly `МОИТЕ ФИРМИ` card for the original Vite UI. Explicit `assigned_to` filter and Supabase RPC, no fake Twilio or recording.
3. `tests/first-worker-manual-rollback.sql`: synthetic simulation with transaction ROLLBACK, not real browser OAuth.
4. `sql/016_google_linked_invite_approval.sql`: correct the verified linked-Google account edge case in `david_admin_approve_worker_invite`, while retaining explicit Admin approval.
5. `sql/017_worker_assigned_only_rls.sql`: strict worker assigned-only read, preserving Admin read. **Breaking change:** removes legacy worker discovery of unassigned pickup pool; verify legacy claim workflow before applying.

## Evidence and limitations
- PASS on actual DAVID Call Desk database under BEGIN/ROLLBACK: create + duplicate replay, audit exactly once, foreign assignment denied, opt-out stops subsequent call outcome, inactive worker denied, call logs unchanged.
- Post-test readback: new manual ledger absent (expected after ROLLBACK); 5 firms, 0 invitations and 0 call logs remain.
- PASS under BEGIN/ROLLBACK: SQL 016 compiles and function body checks linked `auth.identities.provider='google'`. Existing Google-linked admin has `raw_app_meta_data.provider='email'`, proving why a single primary-provider check is insufficient.
- NOT PROVEN: real authenticated worker, actual browser/mobile session, POST to deployed RPC, real Admin inbox render, true multi-tenant HTTP RLS, staging build, ready Vercel preview. Security tool blocked proposed role-impersonated RLS trial for SQL 017. Keep it staged for review.
- NO production migrations or deployed source changes were performed by this PR.

## Manual MVP acceptance (exact order)
1. Recover original editable Vite source/backup privately and compare live production 1:1, or work within an already verified full source checkout. Keep production unchanged.
2. Review `015`, `016`, `017` and original claim/pool regressions. Apply only after approval to a test environment, then verify SQL, policies and security advisors.
3. Mount `mountFirstDppWorkerPilot(container,supabase)` only after verified Google OAuth and approved worker role in the recovered source. Add original Admin activity ledger read-only view, scoped to active Admin.
4. Admin creates one worker invite by official Google email. User logs in, Admin explicitly approves and can block. Uninvited Gmail cannot access CRM.
5. Admin assigns 2 approved test firms using publicly sourced business phones. Confirm worker sees exactly 2 and zero from other worker/tenant, including direct Supabase API with a second account.
6. Worker dials **manually** from an authorized business phone, creates CRM outcome, adds notes/follow-up. Admin observes same persisted activity. No Twilio CallSid, recorder or synthetic duration.
7. Worker selects `Без повече контакт` and dialing becomes unavailable. Disable worker and confirm database/RPC refuse further activity immediately. Test Android and second unauthenticated account.
8. Only after these are GREEN, use real B2B sources subject to local calling rules, opt-out, retention and legal approval.

## DAVID OS P2.4 remains BLOCKED
The server-only reference adapter at `integrations/david-os/dpp-bridge.mjs` is ready for Mitko to integrate, but `SoulFlameAdmin/david-os` and corresponding Vercel project remain inaccessible. No frontend-only unlocking: code redemption must create a secure DAVID-side session after verifying authorized Google staff identity and Call Desk role.

**DO NOT MERGE OR DEPLOY until live worker/browser tests + full original source + legacy company-pickup regression are cleared.**
