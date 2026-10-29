# P0: DPP Google-only worker enrollment / no generated code (29 Oct 2026)

## User's intended experience
1. A new person opens the **original** DPP Call Center and signs in with their own Google/Gmail account.
2. They see **„Чака одобрение от администратор“**, no code or task access.
3. Both owners (Mitko and Borko) see verified Google email/name + **Одобри оператор** / **Откажи** in the Admin Panel.
4. Approval grants Worker, not Admin. Assigned tasks and assigned companies are visible on subsequent Google logins without a second code.
5. The same Google account and membership are retained; authentication uses secure HttpOnly refresh cookies. When the session eventually expires, the worker logs in with Google again; there is **no indefinite session**.
6. Deactivation instantly blocks access. New or rejected Gmail users never see CRM contacts.

## Canonical backend: ALREADY DEPLOYED
Supabase project `lyyqfpbrgjsxdqukwurl` migration `david_google_login_pending_approval_v1` has already been applied. Secure RPCs:
- `public.david_google_enter_workspace()`: after verified Google OAuth, register pending request OR grant active session for *previously approved* member. It never grants a new user a role.
- `public.david_admin_google_access_requests()`: only the two verified Owner Admins may read pending requests.
- `public.david_admin_review_google_access(p_user_id uuid,p_approve boolean)`: only those owners may approve/reject; approval creates a real worker identity.

New requests are stored in `public.david_google_access_requests` with RLS enabled, no direct `anon/authenticated` table permissions. Anonymous callers cannot execute those RPCs. Existing code-based legacy DB RPCs remain for backward compatibility but must not appear in the new DPP UI.

## Working DAVID OS implementation (different Vercel project)
PR: https://github.com/SoulFlameAdmin/david-os/pull/10 (MERGED)
Admin UI: https://david-os-rust.vercel.app/work/dpp/admin
Worker UI: https://david-os-rust.vercel.app/work/dpp/worker
Exact code examples: `app/api/work/dpp/route.js`, `app/work/dpp/page.js`, `app/api/work/dpp/tasks/route.js`, and `db/migrations/20261029_google_approval_no_code.sql`.

## Required in Borko ORIGINAL Vite source before its next production deployment
- Recover the original editable `index.html`, `package.json`, UI source and all Voice endpoints; do **not** connect this incomplete repo directly to production.
- On Google OAuth return, server-side call `david_google_enter_workspace` using only the caller's verified Supabase Auth JWT; never use a client-supplied Gmail or role.
- On pending, show a restricted waiting view and periodically poll own status; on approved call existing `david_operator_portal_snapshot` and load worker's scoped tasks/CRM; on rejected or deactivated deny access.
- In Admin section list `david_admin_google_access_requests` using the admin's JWT; approve/reject via `david_admin_review_google_access`. Never reveal service-role keys or one-time codes.
- Hide/remove Generate Code and Activate Code fields/buttons from both worker and admin screens. Preserve Google OAuth PKCE state, token refresh, Owner/Admin isolation, scoped task creation, voice guards, and manual CRM records.
- QA with independent Google accounts on Android: pending cannot read tasks or firm numbers, two owners can approve, auto entry works after approval, session persists across app restart, rejection blocks, deactivation revokes, no legacy Voice regression.
- Only deploy the **tested restored original app** to `https://david-real-workspace.vercel.app/` and report actual Vercel deployment ID + SHA.

## Important boundary
This document is an integration handoff, **not a claim** that the original Borko Vercel app has been changed. The secure backend and DAVID OS production have been changed, but Borko's original UI requires separate source recovery/integration and release.
