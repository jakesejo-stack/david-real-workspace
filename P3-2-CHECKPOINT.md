# P3.2 review checkpoint

Existing production: https://david-real-workspace.vercel.app/

## Implemented
- Supabase DAVID Call Desk: `public.david_prepare_company(uuid)` reserves a company for 30 minutes without requiring phone approval. Calls remain gated separately.
- Safe transaction test: CELEL claim returned `ok=true, can_start_call=false`; ROLLBACK left no reservation.
- GitHub `recovery/compiled-frontend/assets/index-p3-2.js`: patch built frontend for available → prepare → desk flow. Syntax parsed successfully; **not yet browser-smoke-tested**.
- `recovery/compiled-frontend/index.html`: matching static shell.

## Important limits
This repository does **not yet contain the original full Vite source or the Vercel serverless API handlers**. The compiled frontend snapshot is for audit/recovery and must NOT be connected to the current production Vercel project as its source of truth. Doing so would remove or break serverless endpoints, authentication and telephony.

## Required before production
1. Restore the original source from the Vercel deployment source with complete API files.
2. Apply the above logic to original `src/flow-enhancements.js` and `src/company-crm.js`.
3. Test the real authenticated operator path, 2-operator reservation race, release flow, do-not-call and no-dial cases.
4. Confirm no regression to Google Auth, administrator-only UI, admin APIs, Call Records and Twilio safety gates.
5. Deploy preview, smoke-test PC/mobile, then update production only on PASS.
