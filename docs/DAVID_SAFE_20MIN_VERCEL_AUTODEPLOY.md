# DAVID: GitHub → Vercel, every 20 minutes (safety-gated)

Workflow: `.github/workflows/david-safe-20min-vercel.yml`

## Current status: deliberately OFF

Production remains at https://david-real-workspace.vercel.app. This GitHub repository is **PUBLIC** and does **NOT** contain the complete original editable Vite application at its root. Last attempted Git source Vercel build failed: `vite: command not found`. Both facts are explicit reasons NOT to automatically release Git commits to the real Call Desk.

This PR only prepares the **safe** automation and does not start scheduled runs while the workflow is outside default `main`. Do not merge/enable until the following release gates pass:

1. Back up the currently deployed original Vite SPA, original API/voice handlers, and Vercel config; record a rollback deployment ID.
2. Recover the complete, **reviewed**, editable source into root of `main`, including `package.json`, lockfile, `index.html`, original `api/voice.js`, `api/token.js`, `api/config.js` and all existing routes. Verify the browser and worker/admin flows on mobile and desktop. Restore existing Twilio controls with **LIVE_CALLS_ENABLED=false**.
3. Make this repo **private**, protect `main` with PR review and required tests. Set up a `production` GitHub Environment with approval rules when available. Restrict who can change workflow or release gating.
4. After signoff, add a tracked marker `.david-full-source-verified` describing the owner-approved source recovery and rollback. Do not add this marker simply to bypass the check.
5. In GitHub repository Settings → Secrets and variables → Actions, store the Vercel **personal/team deployment token** under `VERCEL_TOKEN` in Secrets. Never put its value in source, email, or chat. The team/project IDs are already pinned to the current DAVID Vercel project.
6. Set GitHub Actions repository variable `DAVID_AUTODEPLOY_ENABLED` to `true` **only after** all the above and the first manually reviewed production release succeed.
7. Merge the reviewed workflow into default `main`. Scheduled GitHub Actions only run from default `main` and timings are approximate.

## Schedule and release behavior

`7,27,47 * * * *` UTC = check every 20 minutes (GitHub scheduling may be delayed).

- If repo is public or `DAVID_AUTODEPLOY_ENABLED` is not true, the release job is skipped.
- Before any Vercel token is exposed, verify source marker, required original files, frozen dependencies, unit tests and production app build.
- Check the **live** Vercel deployment alias and `davidGitSha` metadata; if the SHA is already live, do **not** spend deployment quota on another build.
- If SHA differs, build using production config, stage with `--skip-domain`, smoke-test the staged URL (homepage and `/api/config`), then `vercel promote` that exact build.
- Any failure leaves the prior public production domain untouched; an alert should be investigated rather than worked around.
- This workflow does **not** merge PRs, migrate Supabase, enable paid Twilio calls, enable recordings, or grant access.

## Why not simply sync `main` now?

The upstream repo is not a reproducible representation of the existing live product. Automatically deploying it today would remove/disable essential pages and API behavior or fail to build. Reaching the source-ready state is a prerequisite, not a checkbox to bypass.

## Manual verification after activation

Run **workflow_dispatch** once, confirm stage smoke tests and promoted alias, then verify Google login, worker tasks, company isolation, admin visibility, and a disabled Twilio state on desktop/mobile. Roll back the promoted deployment if any regression appears.

See GitHub Actions workflow runs for the schedule. Do not assume every cron will start exactly at its listed minute.
