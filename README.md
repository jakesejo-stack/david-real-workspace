# DAVID Real Workspace | SoulFlame DPP Call Center

**Production:** https://david-real-workspace.vercel.app/  
**Deployment project:** `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`  
**Isolated Supabase:** `lyyqfpbrgjsxdqukwurl`  
**Stage:** P1/P2 backend implemented; **not yet production-ready or connected to DAVID OS**.

## Implemented in the database

- `sql/003_david_p1_identity.sql`: stable worker identities and company IDs mapped to other SoulFlame systems, with RLS.
- `sql/004_david_p2_worker_link.sql`: explicit activation, short-lived one-time codes, atomic redeem, replay prevention, revocation and service-only verification.
- Earlier P3.2 `sql/002_david_prepare_company.sql`: preparation independent of approved dialing.
- SQL rollback tests passed for issue/redeem/replay, expiry, rate limiting, unknown user and linked DAVID revocation; no real codes or test workers persisted.

## Pending integration

- `api/worker/david-link/create.js` and `status.js`
- `api/admin/workers/activate.js`
- `api/integrations/david/redeem.js`, `me.js`, `assignments.js`
- `src/david-worker-link.js` (worker profile component; not mounted in the live Vite source)
- [Technical integration and security contract](docs/DAVID-DPP-P0-P2-INTEGRATION.md)

## Safety

Do NOT link this incomplete GitHub repository as production source for the existing Vercel project. The original Vite app and its existing serverless voice handlers must first be restored and tested. Do not enable paid Twilio. Do not place secrets or raw authorization codes in GitHub.

**Important:** Repository visibility is currently public. Change to private before adding confidential operational material. The original legacy Call Desk member-role revocation still needs alignment with the new active worker identity before end-to-end security approval.
