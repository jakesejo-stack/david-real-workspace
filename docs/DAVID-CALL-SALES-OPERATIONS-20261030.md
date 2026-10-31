# DAVID CALL SALES | Operator / Admin rollout
Updated: 30 Oct 2026
Single system: https://david-real-workspace.vercel.app/
Repo: jakesejo-stack/david-real-workspace
Supabase: lyyqfpbrgjsxdqukwurl
Branch: feature/david-gemini-text-coach-20261030

## User story
An approved operator (e.g., Ilker) opens the original Live Call Desk. The browser's official Twilio Voice SDK obtains a short-lived token from /api/integrations/david/task-token. A real paid call is initiated ONLY by a manual click, approved personal task, exact administrator-allowlisted E.164 phone, active worker status and Twilio configuration. A second manual confirmation shows the real number and acknowledges carrier charges. The existing TwiML app must be configured to POST to /api/integrations/david/task-voice. It is never a dial-by-arbitrary-number implementation.

During a call, the customer says "Ало?" and the operator reads a proposed reply in the green DAVID text field. Client and operator lines and the corresponding DAVID advisory text are linked by an actual parent Call SID. Twilio STT must start after a separate verified permission for processing client voice with AI; audio recording requires separate permission. The phone mode also shows earlier company notes at the side. Stop buttons immediately terminate the relevant provider operation.

After a call with a matched assigned company, the operator chooses one of three outcomes (Не вдигнаха, Неутрално, Ранно записване), writes a note, and selects OK. A server-side owned-call and assigned-company check writes to david_live_call_outcomes. The button navigates to Моите фирми, which loads notes and offers the transcript and DAVID sales coaching.

Admin Panel provides New Audio and New Chat counters from actual stored recordings and text, scoped to each administrator's read state. Admin-only server-side audio proxy returns recordings; workers cannot access audio, even by guessing the endpoint. Admin and owning worker can read appropriate transcripts and notes.

## Data model / service boundary
- public.david_live_call_sessions (Call SID, operator, company snapshot, legal permission flags)
- public.david_live_transcript_segments (final utterances, both tracks, Twilio callback deduplication)
- public.david_live_coach_suggestions (client utterance to proposed DAVID text and model latency)
- public.david_recordings (Twilio Recording SID metadata; private audio fetched on demand)
- public.david_live_call_outcomes (worker-selected outcome, business note)
- public.david_admin_call_inbox_reads (per-admin seen statuses)
- public.david_ai_messages (worker Soulflame AI chat history)
- User/company data under existing david_members, david_companies and david_worker_identities.
Service-role access is server only; RLS enabled; clients have no direct table privileges on new tables.

## QA in order
1. Verify node syntax and GitHub QA (fail closed for unauthenticated calls, signed Twilio callbacks, and admin-only audio).
2. Vercel Preview build and browser QA for desktop/mobile: Live Desk phone controls, scrollable transcript, notes sidebar, separate consent, postcall choices, status persistence, My Companies notes and Admin badges.
3. Twilio credentials and account: Account SID, Auth Token, API Key SID/Secret, TwiML App SID, outbound number, exact PUBLIC_ORIGIN, allowlisted destinations and correct callback URLs.
4. Enforce real monthly spend cap before activating calls. Current per-task limit is one daily attempt, 5-minute max; this alone does NOT prove the total budget cap.
5. Verify caller identity, approved company/phone, sign-in, active worker, task assignment, device microphone, Twilio App voice URL and signed callbacks.
6. Run a single authorized call without STT/recording; confirm actual Call SID and Twilio statuses.
7. Confirm legal notice and permissions, then opt in separately to live STT and recording. Reject when permission is denied. Validate Bulgarian STT and client/operator track mapping.
8. Inspect the real call timeline, admin-only audio, complete notes and outcome updates. Verify read permissions and message retention/deletion.
9. Measure end-to-end elapsed time FINAL client utterance -> DAVID visible text; sub-3-second target is not guaranteed or verified.
10. Review GDPR notices, region, retention/deletion policy and audit before customer rollout.

## Feature flags remain OFF until gates pass
LIVE_CALLS_ENABLED
ENABLE_RECORDING
DAVID_LIVE_TRANSCRIPTION_ENABLED
DAVID_LIVE_RECORDING_ENABLED
DAVID_LIVE_COACH_ENABLED

## Release / known blockers at time of writing
Vercel Hobby has returned 402 api-deployments-free-per-day (100 daily deployments). Do not claim that newest branch is deployed until latest SHA is READY under the original production alias. Previous Preview fb51f97 is READY. Current Production is older than the latest branch.
Twilio project secrets are not configured in Vercel; no real Twilio calls or STT/audio have been verified.
The new Supabase tables exist with RLS and zero synthetic records; no fake call data has been written.
