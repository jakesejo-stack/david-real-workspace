# DAVID P7–P8 original Twilio/recording audit (2026-10-28)

**Original baseline:** Vercel deployment `dpl_CgUV2jvbw7iCJkCXHCe63LVEWCAd`. Files were recovered exactly from original deployment and are stored under `source-recovery/original/api/`.

## Verified from original source

| Route | Evidence | Current action |
| --- | --- | --- |
| `POST /api/token` | Explicitly refuses to issue a Twilio Voice token unless `LIVE_CALLS_ENABLED=true`; authenticates user and requires Twilio account/API/application keys | Keep disabled until test approval and keys verified |
| `POST /api/recording` | Verifies Twilio callback signature, requires `ENABLE_RECORDING=true`, validates Twilio IDs, then stores recording metadata with `consent_basis:null` | **Do not enable recordings** without lawful basis, consent/notice policy, retention and callback checks |
| `GET /api/admin-recording?sid=RE...` | Authenticates, checks admin, checks matching metadata, requires `ENABLE_RECORDING=true`, fetches from Twilio and returns private no-store attachment | Do not unlock production recordings until authorized access and deletion/privacy lifecycle are tested |

## Verified project environment, key names only (no secret values read)

- `LIVE_CALLS_ENABLED` configured as `false`.
- `ENABLE_RECORDING` configured as `false`.
- `TWILIO_ACCOUNT_SID` is absent.
- `SUPABASE_SERVICE_ROLE_KEY`, `DAVID_LINK_CODE_PEPPER`, `DAVID_BRIDGE_SHARED_SECRET` absent.

## Release safety gates

1. Restore and review the whole original telephony backend, including `api/_lib.js`, `api/voice.js`, `api/call-progress.js` and `api/budget.js`; they are not yet available in full source. Check revoked-worker access to `/api/token` and ensure voice budget rejects inactive workers.
2. Obtain explicit approved test destination, legal notice/consent checklists and capped test spend before enabling P7.
3. Run a manually initiated 3–5 minute call in a legal non-recording mode before adding live audio/STT or recordings.
4. For P8 mode A, a verified consent basis, revocation/STOP, limited access, retention/deletion lifecycle and audit trail are prerequisites. Current `consent_basis:null` shows this flow is **not ready**.
5. Test B (live audio without recording) only with its own legitimate permission and no persistent raw-audio transcripts. C remains text-only and no audio stream.
6. If the test cannot be performed, report P7/P8 as BLOCKED; do not fabricate call metadata, latency, STT accuracy or recordings.

**Decision:** Preserve original API source and keep real calls/recording disabled until human-approved verification. P7/P8 cannot be declared GREEN.
