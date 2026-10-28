# SoulFlame DPP Operator Portal | 2026-10-28

## Published (different from Mitko's DAVID OS)
- Live site: https://soulflame-dpp-operator-portal.vercel.app/
- New Vercel project: `prj_VpySOXkm4loFRv76Lgwvq9ncwcWQ` (owned by `jakesejo-4964`).
- Production deployment: `dpl_13DkhLfFGGVcNF25UdZSjRC8zR3g`, status READY; HTTP GET for alias verified 200.
- Original Mitko page https://david-os-rust.vercel.app/work is **not modified**. Existing project is inaccessible through both GitHub and Vercel connectors; it still displays a disabled code field.
- This new portal shares the *Call Desk Supabase* project `lyyqfpbrgjsxdqukwurl`, not a second DAVID database.

## What has been implemented
- Responsive black/gold operator login, verified Google session through Supabase Auth, code field format `#XXXXXXXXXXXX!` (12 symbols from specific alphabet).
- Backend migrations `020_operator_portal_code_sessions.sql` and `021_reserve_three_admin_emails_in_worker_invites.sql` **applied** in Call Desk Supabase.
- RPCs: `david_operator_portal_activate(p_code)`, `david_operator_portal_snapshot()`, `david_operator_portal_logout()`.
- Code verification binds to the **same Google user** that generated the code in Call Desk, active approved membership, same worker ID, code hash, issued status, expiry, and rate limiting.
- A successful activation consumes the original code **once** and grants a 4-hour database-gated operator portal session. This means the SAME code can no longer be redeemed at the separate DAVID OS bridge. Generate a different code later if linking to DAVID OS.
- Snapshot exposes **only companies assigned to that authenticated worker**, no unassigned pool. Phone numbers are withheld unless `calling_approved` and `!do_not_call`.
- Revoking `david_worker_identities.active` immediately fails portal snapshot regardless of existing session.
- New session/attempt tables have RLS enabled and no direct access granted to anon/authenticated roles; RPC access restricted to authenticated. Backend login_required fail-closed verified.
- Fixed `david_admin_approve_worker_invite` to check actual linked Google identity instead of only the primary provider.
- 3 admin emails are reserved from worker invitations and remain active: owner, Mitko, DPP.
- Site is static and loads Supabase JS browser client using a public publishable key. **No service-role key/bridge secret is in the browser.**

## ONE REQUIRED MANUAL AUTH SETTING BEFORE GOOGLE E2E
Supabase organization owner must open:
https://supabase.com/dashboard/project/lyyqfpbrgjsxdqukwurl/auth/url-configuration

At Auth → URL Configuration → Redirect URLs add this exact address:
`https://soulflame-dpp-operator-portal.vercel.app/`

Save. Keep the existing Call Desk redirect allowlist entry. No change to Google OAuth provider's Supabase callback URL is normally needed, because the Supabase project is the same one.

## Smoke test
1. Open https://david-real-workspace.vercel.app/ and log in with an **approved active Google account**.
2. Generate a NEW 12-minute single-use code (e.g. `#XXXXXXXXXXXX!`) using the existing Call Desk action. Do not post the code in GitHub or Gmail.
3. Open the new operator portal and click Google. Log in using the SAME approved account. If redirected back to Call Desk, check the Auth Redirect URLs above.
4. Paste the fresh code in the new portal. The server should return `ok:true`, and the portal should show only your assigned companies. Admins may legitimately have zero assigned companies.
5. Reload: same session should remain valid until expiry/revocation. Reusing the same code should be rejected. An unapproved Google user and another worker's code must be denied.
6. Logout/lock: access should require a new code again.
7. Admin invites and approves a real new worker using the Call Desk admin workflow, then assigns at most two verified test firms, checks first user’s access vs the second and revocation.
8. Only after manual E2E including callback, mobile, and authorization tests is production access VERIFIED. No Twilio/AI voice, recording, actual phone calls, or original DAVID OS integration claimed.

## Verified vs pending
- Production new portal static GET: PASS (HTTP 200).
- SQL compile under BEGIN/ROLLBACK: PASS; migrations applied.
- RLS/EXECUTE privilege inspection: PASS.
- Unauthenticated RPC snapshot: PASS (`active:false,reason:login_required`).
- Actual browser OAuth redirect, authenticated code issuance/redemption, worker-company E2E: **NOT TESTED**.
- First worker: **NONE** (3 active admin accounts, 0 workers at time of check).
- Original DAVID OS /work: **BLOCKED BY ACCESS**.

Do not simply remove `disabled` from the original page; connect its host-auth session to the already prepared server-side bridge, with server-only secret and browser E2E tests.
