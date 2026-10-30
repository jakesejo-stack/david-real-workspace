# DAVID Call Center upgrade — source recovery and review package

Existing application: https://david-real-workspace.vercel.app/
Project: `prj_wJOAuRlfScMMDDabk8PmzpbpznWW`
Source snapshot: production deployment `dpl_GZnBuaPF22vnD3Ysnufm1JgtCdYU`.

This package recovers the current public frontend and adds a focused interface upgrade. It is **not a complete production checkout**: the original serverless API implementations are not included. Do not replace the production source or connect the incomplete repository to Vercel.

## Result

- Keeps the DAVID identity and black sidebar; removes the nested taskboard sidebar.
- Admin tabs: Operators, Tasks, Companies, Calls, Settings. Existing forms and authenticated handlers are moved into panels without recreating their event handlers.
- Operator Call Desk centers the assigned number, task, script, real call start/end, mute and DTMF keypad. Rehearsal is a separate collapsed option and never initiates a phone call.
- Default action is a real call, enabled only when all readiness checks pass and the number matches the assigned daily task. Server authorization, verified callbacks, pricing and budget limits remain authoritative.
- Existing recording/transcription limitations are stated accurately. No fake recordings, successful call indicators, new admin permissions, or database rows are introduced.
- Admin navigation requires the server-provided role plus the existing two-email allowlist. This UI check does not replace server authorization or Supabase RLS.

## Verified production blockers (2026-10-30)

`GET /api/config` returned:

```json
{"databaseConfigured":true,"serverConfigured":false,"telephonyConfigured":false,"liveCallsEnabled":false,"recordingEnabled":false}
```

The Vercel environment variable inventory contains no `SUPABASE_SERVICE_ROLE_KEY` and no Twilio credentials. Required server values in the current config handler include `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_FROM_NUMBER`, and `PUBLIC_ORIGIN`. Configure secrets directly in Vercel, never in this repository or a chat message. Confirm the TwiML application's Voice URL, signed callbacks, allowed destinations and budget before enabling live calling.

The GitHub repository lacks current task/voice handlers present in the deployed app. Vercel source retrieval truncates larger source files, and its file tree truncates nested handler entries. A preview-only source preservation test proved that `deploymentId` plus `files` replaces source files rather than merging them. That preview failed with ENOENT and received no production alias. Production was not changed.

## Build and validation

```sh
npm test
npm run build
node --check dist/assets/index-p3-2.js
```

No dependency installation is required. The build copies the recovered frontend and injects the upgrade adapter immediately before the existing boot entry. The original snapshot in `public/assets/index-p3-2.js` is retained unmodified.

For local UI QA only, run `node qa/build-fixture.mjs` after building, then serve `dist`. The fixture is labelled QA, uses synthetic data, and cannot place calls. It is not included by the ordinary build.

Validation completed: four Node test groups covering readiness, admin eligibility, international number parsing, assigned-number matching and blocked/busy states; JavaScript syntax; browser inspection of the synthetic admin and operator layouts, admin tab switching, hidden admin navigation for workers, and disabled calling without configuration.

## Integration and release conditions

1. Recover a complete current deployment checkout including **all** serverless handlers. Keep the original APIs and Supabase data intact.
2. Run this package's build and merge the resulting frontend assets and HTML into that complete checkout. Do not deploy this standalone package.
3. Confirm both admin Google accounts and an approved worker through the actual login/approval/task flows. The QA fixture does not verify real accounts, RPCs or RLS.
4. Configure the missing server values and verify Twilio's application, callback signatures, account/trial restrictions, caller ID, destination permissions and budget.
5. Stage a complete production build without changing the domain, perform an explicitly authorized call to the chosen test recipient, and verify audible two-way audio, timestamps, final status and recording consent/storage if enabled.
6. Promote only after those checks pass. Retain the current deployment as rollback.

Not verified: real authenticated account flows, approval RPC mutations, telephony, recording playback, transcription, AI voice, transfers, hold, or a production release. No real outbound call was placed.
