# P2.4 DAVID OS `/work` operator login: implementation handoff

**28 October 2026.**

## Observed blocker on the real DAVID OS page

The live `https://david-os-rust.vercel.app/work` currently shows a disabled code input with “Активира се при настройката на служебните акаунти” and a disabled button “Вход за служители · Очаква активация”.

This disabled screen is deliberately **not an active login**. Call Desk can generate a new `#XXXXXXXXXXXX!` one-time code for an approved Google account, but that does **not** activate the separate DAVID OS backend.

Our available Vercel connection lists only `jakesejo-4964s-projects`, which owns **DAVID Real Workspace**, not `david-os-rust`. Both connected GitHub identities get 404 for `SoulFlameAdmin/david-os`. We have **not** changed the DAVID OS repository or deployed its live route.

## READY code supplied for DAVID OS team

`integrations/david-os/dpp-bridge.mjs` is a **server-side reference adapter**, not a deployed route. It exposes:

- `redeemDppCode({code,authenticatedDavidUserId,bridgeSecret,fetchFn})`
- `verifyDppStaffSession({authenticatedDavidUserId,bridgeSecret,fetchFn})`

No shared static codes, no Guest identity privilege escalation, no raw code in localStorage or URL. The adapter never sends the secret to the client. The DAVID OS project owner must integrate this with its existing server-side auth/session framework, because those APIs and project source are currently inaccessible.

## Required DAVID OS implementation

1. On `/work`, show the code input **only when the DAVID OS backend and Call Desk bridge are both configured and authenticated DAVID-user context is available**. Keep failure states clear and non-permissive.
2. The browser POSTs the code to a **same-origin DAVID OS server route** using HTTPS, with CSRF/session and rate limiting. The browser must **never** send the `DAVID_BRIDGE_SHARED_SECRET`.
3. The DAVID OS route retrieves `authenticatedDavidUserId` from a verified server-side session, **not user-supplied JSON**. If the DAVID staff user has no authenticated DAVID identity, prompt for the product's actual login or establish one through its legitimate auth provider.
4. Use `redeemDppCode` server-to-server to `https://david-real-workspace.vercel.app/api/integrations/david/redeem` (JSON `{code,external_user_id}`; Bearer shared secret).
5. Only on verified `active:true` issue a **new separate secure HttpOnly, SameSite session** on DAVID OS, storing minimal `worker_id,organization_id,role,external_user_id`. No privilege from guest cookies.
6. DAVID OS calls `GET /api/integrations/david/me` with the same server-to-server authentication to check continued active status. On 403 or network failure, deny access to CRM and keep a safe retry.
7. DAVID OS calls `GET /api/integrations/david/assignments` and shows only that worker's scoped company records. No tenant wildcard, no exposed service-role key.
8. After backend successful link, the operator returns to Call Desk → Operator DPP → **Провери синхронизацията**, which reads the linked worker ID from the Call Desk database.

## Required server-only environment configuration

In **Call Desk** Vercel project `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`:
- `SUPABASE_SERVICE_ROLE_KEY` from its own project `lyyqfpbrgjsxdqukwurl` (never in browser)
- `DAVID_BRIDGE_SHARED_SECRET` a random long secret

In **DAVID OS** Vercel project:
- `DAVID_BRIDGE_SHARED_SECRET` same exact secret, server only, do not prefix `NEXT_PUBLIC_` or `VITE_`

The DAVID OS identity/session datastore and cookie-signing secret are separate and must come from its existing secure authentication infrastructure.

Current Call Desk Vercel project environment list contains only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_ORIGIN`, call limits and Twilio control variables, **not** the two bridge credentials. Hence `/api/integrations/david/me` currently returns `503 bridge_unavailable`; this is a correct fail-closed behavior. Never paste credentials into email, chat, screenshots or Git.

## Acceptance tests to mark P2.4 GREEN

- Approved worker logs in via legitimate Google/DAVID flow and issues unique Call Desk code. DAVID OS redeems within 12 minutes, gets correct worker ID and scope.
- Second attempt with **same** code fails; wrong, expired, revoked, brute-force codes fail; code cannot be used for a different DAVID account.
- Google-only unapproved account and fake client-supplied external user ID cannot gain staff access.
- After admin deactivates operator, the linked DAVID session loses CRM access and cannot be revived by refresh.
- A second worker sees only his own assignments; no admin pages or other tenant/company data.
- Both product and browser mobile smoke tests confirmed. Log only safe event metadata, never secret or raw activation code.

## Access needed to execute the fix on the actual URL

Mitko must either (a) grant the connected GitHub account access to the actual `SoulFlameAdmin/david-os` repo and add the connected Vercel user as a collaborator/team member for `david-os-rust`, **or** (b) integrate the above module into his private DAVID OS source and deploy it himself.

**Do not simply remove the HTML `disabled` attribute.** That would be a fake login because the backend check and session do not yet exist.
