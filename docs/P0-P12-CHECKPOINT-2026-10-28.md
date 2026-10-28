# DAVID Real Workspace | P0–P12 release checkpoint (2026-10-28)

**Product:** existing https://david-real-workspace.vercel.app/# (do not replace the original interface).  
**Project:** `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`.  
**Call Desk database:** `lyyqfpbrgjsxdqukwurl`.  
**GitHub:** https://github.com/jakesejo-stack/david-real-workspace (currently PUBLIC; do not commit secrets or real customer data).

## Verified deployments
- Original baseline reference: `dpl_CgUV2jvbw7iCJkCXHCe63LVEWCAd`.
- Current production at beginning of this work: `dpl_3VpXEitM7So2zAMJDsALai7gjFJ7` READY.
- Preview P5 operator reporting: `dpl_4nZ9qjA2FmGt7SYcCz2No2VecVWr` READY. Original HTML and compiled frontend HTTP 200, `/api/config` HTTP 200, original API paths protected, signed DPP webhook handler returns expected GET 405. Latest minor UI copy correction remains in GitHub pending a new preview.

## Verified source recovery
Four exact original source files are preserved under `source-recovery/original/`: `.gitignore`, `api/config.js`, `package.json`, `vercel.json`. Full editable Vite source and older handler contents not yet recovered due truncated Vercel file-content API. The original serverless API file hash references were preserved and reused in previews. **P0 remains BLOCKED.**

## Verified deployed database work (no fake users or call logs)
- `sql/002`: company preparation independent of dialing; CELEL tests `AVAILABLE → PREPARE → RELEASE` with `can_start_call=false`.
- `sql/003-005`: stable worker ID, organizations, one-time link codes, replay resistance and active member restrictions.
- `sql/006-008`: manual company intake with email provenance and verified admin identity bootstrap.
- `sql/009`: pending worker invite before verified Google login, explicit admin approval and audit.
- `sql/010-012`: tenant-scoped support inbox, verified-before-closed status transitions, duplicate retry protection.
- `sql/013`: active workers report DPP issues only for their assigned company.

### Test evidence
1. SQL ROLLBACK PASS: worker code issue/redeem/replay/expiry/revoke.
2. SQL ROLLBACK PASS: unapproved worker cannot prepare/claim or query legacy CRM.
3. SQL ROLLBACK PASS: last active administrator cannot be disabled.
4. SQL ROLLBACK PASS: pending invitation cannot be approved without verified Google user.
5. SQL ROLLBACK PASS: support ticket creation, triage, VERIFIED before CLOSED, repeated CLOSED has no new audit event.
6. SQL ROLLBACK PASS: signed source receiver's **database prerequisite** rejects unmapped org, replays return same ticket ID with no duplicate audit.
7. SQL ROLLBACK PASS: unassigned CRM company rejected for worker issue; assigned company accepted with audit event.
8. SQL admin RLS verified: one admin record and all five CRM companies visible. All synthetic test writes rolled back.

### Actual data snapshot
Five real companies, zero support tickets, zero pending invitations, zero recorded calls and zero external organization mappings. These are not proxy evidence for success of Twilio or customer support E2E.

## P0–P12 classification
| Stage | Status | Evidence / blocker / owner |
| --- | --- | --- |
| P0 Source recovery, secure Git, baseline QA | **BLOCKED** | 4 originals recovered, full source, private repo and browser regression still missing; Borko |
| P1 Canonical IDs across three systems | **YELLOW** | Call Desk DB mapping and admin UI prepared; no validated DPP org ID yet; both |
| P2 Owner Admin + worker invite/revoke | **YELLOW** | SQL and UI done, no 2 real Google-worker E2E; Borko |
| P3 Operator code and DAVID OS session | **BLOCKED** | Single-use RPC + UI, server bridge secrets and Mitko's receiver missing; Borko/Mitko |
| P4 Restricted CRM assignments | **YELLOW** | RLS and claim tests, no 2-worker isolation browser test; Borko |
| P5 Client support/report pipeline | **YELLOW** | Worker/admin ticket UI, source-mapped signed HTTP receiver, no external DPP producer E2E; both |
| P6 DAVID triage → private GitHub issue/PR | **BLOCKED** | No trusted DAVID AI triage or private verified repo issue flow; both |
| P7 Twilio Voice test | **BLOCKED** | Telephony not configured, no approved cost or test call; Borko |
| P8 Live DAVID STT/AI modes | **BLOCKED** | Consent and permissions, real media integration and latency tests absent; both |
| P9 Existing SoulFlame /dpp and Autopilot link | **BLOCKED** | No cross-system real ID mapping/test lead; Mitko/Borko |
| P10 Owner Admin + health | **YELLOW** | Operator controls, CRM, tickets; no cross-system health or events; both |
| P11 E2E acceptance | **BLOCKED** | 2-worker, two-tenant, Twilio, browser/mobile, product-ticket QA absent; both |
| P12 First worker pilot | **BLOCKED** | Gate P0-P11 not completed; Borko/Mitko |

## Release gates
**Do not move this incomplete Git repository into Vercel's production Git source.** Current Vercel previews assemble unchanged original API SHA references plus recovered compiled UI and new API handlers, not a complete original source checkout.

Do not enable paid Twilio, client audio/recording, service-role secrets in browser, fake production tickets or paid DPP flags. Existing admin/CRM controls only.

For P3, server-only secrets `DAVID_LINK_CODE_PEPPER`, `DAVID_BRIDGE_SHARED_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` are not verified configured. DPP signed receiver also needs distinct provider webhook secrets. No secret values belong in GitHub. The owner must also verify original service JWT implementation before enabling partner actions.

**Immediate real pilot dependencies:** restore original source/backup; mark Git private; 2 verified worker accounts and testing; Mitko's code redemption/session, manufacturer ticket backend; protected secret config; permitted Twilio manual test and legal audio mode selection; admin/browser regression; eventual user-approved GO decision.
