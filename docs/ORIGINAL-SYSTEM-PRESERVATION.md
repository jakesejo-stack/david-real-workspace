# Preserve the Original DAVID Real Workspace

Production URL: https://david-real-workspace.vercel.app/
Vercel project ID: `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`
Verified active production deployment: `dpl_CgUV2jvbw7iCJkCXHCe63LVEWCAd`
Original page title: DAVID | SoulFlame DPP Call Desk

## Non-negotiable preservation rules
- Keep the original DAVID logo, layout, styling, navigation and desktop/mobile experience.
- Retain Company Info, Live Call Desk, Call Records, General Info, and the admin-only Admin Panel.
- Preserve working Google login, original existing serverless APIs, Supabase connection and Twilio safety limits.
- Enhance existing pages only; no separate replacement product, blank Vite skeleton, template, or demo.
- Preparation eligibility must not authorize real outbound calls.
- Preserve audit history and data. Do not create fake call records.
- **Do not connect this incomplete repository as the Vercel production source until full original source recovery and regression tests pass.**
- Preview, review, restore production code, then publish only if tests pass. Always retain a rollback target.

## Verified after backend permissions update
- Existing production deployment remains READY and serves HTTP 200 with original page title.
- SQL transaction impersonating the approved admin with role authenticated can still see the admin's member record and all five current company records under RLS.
- This is SQL-level evidence only; it is NOT a complete browser sign-in, audio, worker, or admin smoke test.

Current code in this repository is an incomplete recovery plus P1/P2 additions, NOT the complete live deployment source.
