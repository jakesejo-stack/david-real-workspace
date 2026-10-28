# LIVE: Original DAVID Admin Panel now renders inside original SPA (2026-10-28)

## Root cause
The deployed original Vite bundle had `const i = companies.map(...).join("")` but the Admin UI builder later called `i.join("")` again. This throws `TypeError: i.join is not a function` and leaves the prior tab displayed.

## Production hotfix implemented
- Fixed this single call to append `i` instead.
- Added `davidAdminOverview()` into the existing `Pu()` Admin render function. It renders **inside `#content`**, keeping the original DAVID sidebar, authenticated Supabase client and existing CRM/Twilio APIs intact.
- The new Admin area includes genuine DB counts, 14-day trend, calls, operators, companies, actual manual CRM results, support tickets, admin tasks and audit events.
- The frontend requests `public.david_admin_dashboard_snapshot()`, which is independently restricted server-side to the two active Google admins, `borquitokonsejo@gmail.com` and `soulflame.mitko@gmail.com`.
- Workers still do not receive the Admin navigation button, and the RPC fails with 42501 for unauthorized users.
- No new OAuth flow or cross-domain token exchange is introduced.
- Source pinned in public repo: `recovery/compiled-frontend/assets/index-live-admin-internal.js`, commit `e7807036bd19a6f558399e836833a907d30eef28`.

## Vercel rollout and verification
- Original project `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`; original deployment remains READY `dpl_9nb9N8fa28qp13pSmZcFEd5fyPU1`, unchanged.
- Live **project-level asset rewrite** version `3465744a-e258-43f8-8638-a34f5cde4c07` reroutes only `/assets/index-DMJaHq37.js` to the pinned exact bundle on jsDelivr.
- Staged first, then promoted after byte-for-byte validation against original: only the duplicate-join fix and Admin UI addition differ.
- V8 syntax check **PASS**, staged and production JS **HTTP 200**, production home **HTTP 200**, API /api/config **HTTP 200 and identical in staging**. Vercel route versions confirmed **isLive:true**.
- Requires a real signed-in browser click E2E check, including Android and Worker denial. Do not claim browser E2E already passed.

## Rollback
Vercel Project → Routes → Versions: restore previous production route version or disable/remove `david-test-admin-internal-bundle`. There was no prior project route version. Reverts asset URL to existing deployment JS without changing the backend.
For connector operators, `mcp__Vercel__update_route_versions` restore previous version, or stage `overwrite:true, routes:[]` and promote the resulting empty version after validation.

## Follow-up technical debt
A pinned external CDN is an interim delivery layer for the compiled bundle because full editable original Vite source remains missing. Mitko should recover the editable original source and migrate the one-line fix and native Admin dashboard into that source; then deploy a normal Vite build and retire the project-level CDN rewrite. No direct production Git merge took place.
