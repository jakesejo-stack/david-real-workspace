# P0 original-source recovery log

Source deployment: `dpl_CgUV2jvbw7iCJkCXHCe63LVEWCAd`, original DAVID Real Workspace. Existing production Vercel project: `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`.

## Fully recovered (exact source file, not reconstructed)
- [`.gitignore`](original/.gitignore)
- [`api/config.js`](original/api/config.js)
- [`package.json`](original/package.json)
- [`vercel.json`](original/vercel.json)

The four files were decoded from the deployment file-content endpoint and checked for truncation before committing. They are stored under `source-recovery/original/` rather than as a runnable project root to prevent accidentally replacing the existing production source.

## Not recovered yet
- `api/_lib.js`, `api/admin-recording.js`, `api/budget.js`, `api/call-progress.js`, `api/recording.js`, `api/status.js`, `api/token.js`, `api/voice.js`
- `src/app.js`, `src/bootstrap.js`, `src/budget-ui.js`, `src/company-crm.js`, `src/console-v2.js`, `src/flow-enhancements.js`, `src/google-auth.js`
- `sql/001_david.sql`, `tests/static.test.mjs`, original `index.html`

The deployed-file contents API currently returns truncated base64 for these larger source files; incomplete data must **never** be treated as a complete backup.

## Partial but preserved
- `recovery/compiled-frontend/index.html` and `recovery/compiled-frontend/assets/index-p3-2.js` are a built frontend recovery with P2/P5 updates, **not the original editable source**.
- Existing serverless APIs are preserved in Vercel preview builds using the unchanged uploaded file SHA references from the original deployment. GitHub does not yet contain their full source.
- Original production deployment and existing alias remain the rollback baseline.

## P0 release gate
**BLOCKED:** Do not connect this repository directly to the existing production Vercel project or claim source recovery GREEN until full original editable Vite and API source, repeatable tests, preview/browser smoke tests and backup are verified.

GitHub repository visibility was reported as Public. Change it to Private before storing confidential material or client data. No service credentials are committed.
