# DAVID / SoulFlame Live Call Coach: staged release contract
Date: 2026-10-30
Primary production: https://david-real-workspace.vercel.app/
Repository: jakesejo-stack/david-real-workspace (preserve original system)
Database: Supabase project lyyqfpbrgjsxdqukwurl

## Exact product behavior
During a HUMAN operator's Twilio call the customer speaks. Authorized, consented Twilio real-time STT produces a **final** utterance. DAVID sends that utterance, brief preceding context and the assigned company's verified fields to the operator's encrypted Gemini API key. The HUMAN operator sees:

Client: "..."
DAVID: "Say this next ..."

DAVID does NOT autonomously speak to the customer, dial customers, impersonate the operator, or change CRM state. A human chooses whether to read the suggestion. Suggestions are advisory and may be wrong.

## Architecture
Existing approved Daily Task → Twilio Voice (parent CallSid) → live_call_sessions
→ Twilio Real-Time Transcriptions (only after documented notice/permission, exact signed HTTPS webhook)
→ transcript_segments (final only, idempotency key CallSid / TranscriptionSid / SequenceId)
→ Gemini 3.5 Flash-Lite (only client track, compact context, per-worker encrypted key)
→ coach_suggestions (same CallSid, source segment ID, latency)
→ Live Call Desk (authorized operator polling) and Call Records (read-only details).

Optional separate recording permission → Twilio dual-channel recording → validated status callback → private recording metadata and authorized server-side playback, never a public Twilio URL.

## Current implementation
1. Secure database tables: david_live_call_sessions, david_live_transcript_segments, david_live_coach_suggestions, RLS enabled, no anon/authenticated direct table privileges.
2. Existing API route api/integrations/david/[action].js reuses one Vercel function; original site and user roles remain.
3. Real Twilio parent CallSid creates a session with unique, verified, assigned-company snapshot when permitted dialing actually occurs. No sample calls are written.
4. Call Records details: company, dates, transcript, DAVID responses and authorized audio controls; scrollable X-close modal on phone/desktop.
5. Live Call Desk: shows Client: … and DAVID: …, automatically refreshed, only for active authenticated sessions.
6. Separate, explicit operator-attested client permission controls for transcript/AI and recording, plus independent Stop actions.
7. Recording and STT endpoints require Twilio signature and matching account SID; operator endpoints require verified Google login and active member / assigned session.
8. Transcription callback ignores partials, deduplicates final utterances, and generates AI advice only if DAVID_LIVE_COACH_ENABLED is explicitly true.

## Non-negotiable gated flags
LIVE_CALLS_ENABLED=true and complete verified Twilio credentials required for placing calls.
DAVID_LIVE_TRANSCRIPTION_ENABLED=true required to start transcriptions.
DAVID_LIVE_RECORDING_ENABLED=true AND ENABLE_RECORDING=true required to start recordings.
DAVID_LIVE_COACH_ENABLED=true required for automatic Gemini generation.
Defaults must be OFF when missing. Do not flip these flags during static QA.

Twilio currently lacks required server-side credentials in Vercel and Live Desk shows that Twilio is not configured. Production calls, recordings, true live STT and latency are not yet verified.

## Release gates, in order
A. Static tests: Node syntax, auth denies anonymous, invalid Twilio signatures rejected, DB tables RLS enabled. No real calls.
B. Preview build: original menu/navigation, mobile + desktop modal scroll, close X, empty Call Records, Google auth, role restrictions. No fake data.
C. Test identity: approved worker + matching approved phone/task, valid company mapping, account quota. Real call manually initiated only after explicit approval.
D. Consent: notice to both participants, recorded proof of lawful basis/permission, refusal case, separate recording permission, STOP action, access audit, retention/deletion policy, correct language and provider model. Never process audio before this passes.
E. Live: signed Twilio transcription started mid-call after consent. Verify track mapping (operator vs client), partial suppression, exactly-once storage, AI text and human-only reply, invalid signature denial, cost bounds.
F. Records: verify parent CallSid, company identity, exact duration and timestamps, dual-channel recording available only after consent; media private, access limited to owner/admin, delete and retention tested.
G. Performance: measure end-to-end latency from FINAL client utterance to DAVID visible suggestion. Target p95 <=3 s AFTER final STT, and separate STT latency. Fail gracefully without hallucinating if the model/API times out.
H. Rollout: approved 3-5 minute test calls, then at most two operators within validated monthly spend cap. No bulk outbound.

## Open issues before LIVE flags may be enabled
- Twilio account/API keys, app SID, real provider connectivity and billing verification.
- Bulgarian STT availability and accuracy with the selected Twilio transcription engine, multilingual behavior.
- Approved customer notice, explicit permission workflow, revocation and jurisdiction-specific requirements.
- Automatic retention/deletion and access audit, secure media handling for EU customer records.
- Real browser/mobile end-to-end QA and Twilio negative signature tests against real event payloads.
- Recovery path for callbacks and long-term archive of complete call transcripts.
