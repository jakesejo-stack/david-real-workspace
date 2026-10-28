# SoulFlame DPP Autopilot ↔ DAVID Call Desk: Support Ticket Contract

Status: **receiver implemented in GitHub preview; producer integration NOT completed**. Owner handoff: Call Desk (Borko), DPP Autopilot frontend/backend and DAVID OS (Mitko). Date: 2026-10-28.

## Ownership and boundaries
- DAVID Call Desk Supabase: `lyyqfpbrgjsxdqukwurl`. Authoritative for approved workers, operator assignments, call records and internal ticket inbox.
- DPP Autopilot: authoritative for customer auth, organization, QR/passport issue reports, private documents and client-visible ticket status.
- Call Desk does not read DPP Autopilot tables and DPP Autopilot must not read Call Desk tables. Only verified server-to-server exchange.
- Map an **existing** DPP `autopilot_organization_id` to a real Call Desk `crm_company_id` via Admin → company → external organization ID. Do not fabricate external IDs.
- One client organization / company mapping must be checked by authorized owner before first event.

## Signed ingress endpoint
`POST https://david-real-workspace.vercel.app/api/integrations/dpp/support`

HTTP JSON body, exact **string-valued** fields:
```json
{
  "source_system": "dpp_autopilot",
  "external_org_id": "org-from-verified-DPP-backend",
  "external_ticket_id": "unique-stable-DPP-ticket-ID",
  "title": "QR code fails validation",
  "description": "Sanitized diagnostic summary, no credentials or raw customer documents",
  "category": "qr",
  "severity": "S3"
}
```

Allowed `source_system`: `dpp_autopilot` or `soulflame_twins`. Allowed categories: `qr,passport,document,account,bug,payment,integration,other`; severities: `S1..S4`. Ticket title 4–200 chars, description at most 6000 chars.

Required headers:
- `Content-Type: application/json`
- `x-dpp-timestamp`: Unix seconds, maximum ±300 seconds clock skew.
- `x-dpp-signature`: `sha256=` followed by 64 lowercase hex characters.

The HMAC-SHA256 message is exactly `[timestamp, source_system, external_org_id, external_ticket_id, title, description, category, severity].join("\n")`. Sign the exact sent field values, without trimming or normalization. Compare in constant time on the receiver. Use **distinct** 32+ character server-only secrets:
- `DPP_AUTOPILOT_WEBHOOK_SECRET` for DPP Autopilot.
- `SOULFLAME_TWINS_WEBHOOK_SECRET` for SoulFlame Twins.

The Call Desk Vercel environment must also have `SUPABASE_SERVICE_ROLE_KEY` server-only. **None of these secrets are currently configured for this integration.** Never prefix with `VITE_`, log, paste into GitHub, browser, screenshots or email.

The responder performs a service-only Supabase RPC `david_ingest_external_support_ticket` and does not grant the DPP producer access to the Call Desk database.

## Responses and retries
- `201 {ok:true,ticket_id,created:true}`: newly created internal ticket.
- `200 {ok:true,ticket_id,created:false}`: repeat delivery; same internal ticket, no duplicate audit event.
- `401`: missing/invalid/stale signature.
- `403`: source organization has no approved mapping or ticket collision across company.
- `400`: invalid schema/body.
- `503`: webhook disabled/not configured or backend unavailable.

The DPP producer should retry only transient failures with backoff and retain its source ticket ID. **Never** retry by inventing a new source ticket ID. Never use browser-side HMAC secrets.

## Call Desk ticket lifecycle
- Internal: `NEW → TRIAGED → ASSIGNED → IN_PROGRESS → FIX_IN_REVIEW → VERIFIED → CLOSED` (NEEDS_INFO / REOPENED supported).
- Only Admin may create manual tickets, assign active scoped workers, or change status.
- The database forbids closing before VERIFIED, and identical closure retries do not duplicate event history.
- Worker only sees tickets assigned to their active worker identity. Admin sees the Call Desk organization inbox.
- A client-visible response, GitHub issue or PR, and accurate DPP ticket status callback still need separate authenticated producer/consumer integration and human approval.

## Readiness evidence
- PASS (SQL rollback): synthetic external org mapping, unique ticket creation, idempotent replay, unknown external organization rejection.
- PASS (SQL rollback): premature closure rejected; VERIFIED before CLOSED; identical retry preserved one event per actual transition.
- PASS (SQL rollback): admin creation and triage creates audit history.
- Preview deployment `dpl_FkCiDKehKSFrjPKdLyYnJweRS6Ap` READY with recovered original UI and signed webhook route. Not yet verified E2E with DPP Autopilot.
- Production source recovery remains incomplete, repository currently public; do not put any real customer payload in this repository.

## Blocked until Mitko's and Borko's next verified steps
1. Mitko: integrate authenticated manufacturer `Report Issue` with the producer backend; keep own source ticket ID, tenant ACLs and customer-visible status.
2. Both: verify tenant-specific mapping of one real test organization to a CRM company, with consent and zero duplicate organizations.
3. Borko: configure secret values securely in Vercel, not GitHub; retain credential rotation procedure.
4. Both: send synthetic signed HTTP event, verify first 201/duplicate 200/wrong tenant 403/bad signature 401 and two-tenant isolation.
5. Both: one sanitized private engineering issue and human-approved PR + QA; only then mark customer ticket VERIFIED/CLOSED.
