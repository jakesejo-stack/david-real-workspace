# DAVID OS × SoulFlame DPP: P0–P2 integration contract (28 October 2026)

## Confirmed call-center source of truth
- Git: https://github.com/jakesejo-stack/david-real-workspace
- Vercel project: `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`
- Existing production: https://david-real-workspace.vercel.app/
- Supabase project: `lyyqfpbrgjsxdqukwurl` (DAVID Call Desk)
- Product-side DAVID OS: https://david-os-rust.vercel.app/work (owned separately by Mitko)
- Product-side DPP: `SoulFlameAdmin/DPPautopilot` (read access only).
- The repository `SoulFlameAdmin/soulflame-twins` and `SoulFlameAdmin/david-os` were inaccessible via current GitHub connections (404). This DOES NOT establish that they don't exist.
- Repository visibility is presently PUBLIC. No credentials, raw codes, customer data, tokens, or environment values are committed.

## P1 source of truth & external ID mapping
`david_organizations` maps a tenant. `david_worker_identities` maps a Supabase Auth user to an immutable `worker_id` and `organization_id`. `david_company_external_mappings` maps existing Call Desk `david_companies.id` to IDs in SoulFlame Twins, DPP Autopilot, DAVID OS without rekeying. Tenant isolation is required for all future API paths. No production external ID mappings were invented.

## P2 exact API contract
| Call-center endpoint | Caller | Result |
| --- | --- | --- |
| POST /api/admin/workers/activate | Approved Call Desk admin | activate/revoke an existing DAVID member (worker_id remains stable) |
| POST /api/worker/david-link/create | Approved worker with valid Google Supabase Bearer JWT | new 12-char one-time code, worker_id, organization_id, role, expiry (12 min) |
| GET /api/worker/david-link/status | Approved worker with valid Google Supabase Bearer JWT | worker_id, active, DAVID linked flag |
| POST /api/integrations/david/redeem | DAVID **backend** using bridge service Authorization | atomic consume of code; worker_id, organization_id, role, active, external_user_id |
| GET /api/integrations/david/me | DAVID **backend** using bridge service Authorization | current role/activation for X-DAVID-External-User-ID |
| GET /api/integrations/david/assignments | DAVID **backend** using bridge service Authorization | ONLY assigned firms for verified active worker; dial phone hidden unless approved |

The frontend card `src/david-worker-link.js` is written but not yet imported into the original production Vite entry point. The partner-side DAVID code entry and secure session must be implemented by DAVID OS. Google login alone never grants membership.

### Server-only Vercel configuration to add after security review
Existing: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
Required new secrets (not yet configured): `SUPABASE_SERVICE_ROLE_KEY`, `DAVID_LINK_CODE_PEPPER` (random >=32 chars), `DAVID_BRIDGE_SHARED_SECRET` (random >=32 chars, shared only with Mitko's DAVID backend).
Never prefix these secrets `VITE_` and never store them in Git, browser localStorage, source maps or emails. Rotate on suspected exposure. These endpoints are NOT currently deployed.

### Operator onboarding
1. Existing Google login authenticates person.
2. Admin explicitly enrolls worker with existing `david_admin_enroll_member` then calls `david_admin_set_worker_active(user_id,true)`.
3. Worker sees persistent worker_id. Only explicit click issues a 12-minute one-time code.
4. Worker opens DAVID /work and types the code; DAVID backend submits it to Call Desk /redeem.
5. DAVID stores minimal secure linkage and calls /me or /assignments before accessing sensitive data.
6. Admin deactivates worker via `david_admin_set_worker_active(user_id,false)` to revoke pending codes and live links.

### A/B/C audio modes (NOT activated)
A: legal recording & independently authorized AI stream; B: no recording, separately permitted transient stream; C: neither recording nor AI listening, manual text support only. Not in P0–P2. Twilio unavailable in production. Do not enable commercial calls before compliance and budget approval.

## Verified evidence
- Migration `sql/003_david_p1_identity.sql`: APPLIED to isolated Call Desk database.
- Migration `sql/004_david_p2_worker_link.sql`: APPLIED.
- RLS enabled on all 6 new public tables; link code hashes and attempts have no client SELECT access.
- Authenticated users can call issue RPC, but anonymous cannot; redeem & verify RPC can execute only for service_role.
- SQL rollback test PASS: issue, first redeem, reject replay, verify active, admin revoke, verify inactive.
- SQL rollback test PASS: rapid re-issue limited, wrong code rejected, expired code rejected.
- SQL rollback test PASS: unknown user denied code issuance (42501).
- Eight new source files were syntactically parsed, but this is not a browser/runtime test.
- No fake worker accounts or permanent test links created.

## Security audit notes
Supabase security advisor reports default-deny tables with RLS but no policies (intentional), warns of authenticated SECURITY DEFINER functions (function-level membership checks need continued audit), and reports leaked-password protection disabled. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## BLOCKED / not GREEN
- Original production Vite application files, existing API handlers and secrets are not yet fully recovered into Git. `recovery/compiled-frontend` is a partial snapshot only.
- No P2 endpoints or button are live at existing Vercel domain.
- New secrets are not configured, and the DAVID backend's matching redeem flow is not available for verification.
- Only one admin exists and zero real workers: 2-worker and cross-tenant integration tests cannot honestly be declared passed.
- No full browser/Android/desktop smoke test or preview/production READY deployment.
- Do not connect this incomplete repository to the existing production Vercel project until full-source recovery, functional tests and review.

## Next safe checkpoint
Restore original Vercel source and APIs into this repo; configure new server-only secret names; deploy preview; verify 2 real test operators, revoked/expired/replayed codes and cross-tenant isolation; obtain Mitko's matching DAVID /work backend implementation; only then ship to production.
