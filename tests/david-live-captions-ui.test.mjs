import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/david-call-intelligence-entry.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/server/david-live-calls.mjs',import.meta.url),'utf8');

test('Live Desk has both operator/customer caption stream and per-line DAVID suggestions',()=>{
 assert.match(ui,/Live Captions · Двата гласа/);
 assert.match(ui,/david-ci-captions/);
 assert.match(ui,/aria-live','polite/);
 assert.match(ui,/aria-relevant','additions/);
 assert.match(ui,/line\.speaker==='client'/);
 assert.match(ui,/line\.david_hint/);
 assert.match(ui,/✦ DAVID предлага:/);
 assert.match(ui,/renderCaptions\(data\.transcript,active\)/);
 assert.match(ui,/document\.visibilityState==='visible'/);
});
test('Only consented, active transcription is rendered, without recording requirement',()=>{
 assert.match(ui,/renderCaptions\(\[\],false\)/);
 assert.match(ui,/const active=!!data\.transcription_active/);
 assert.match(ui,/live-consent/);
 assert.match(api,/process\.env\.DAVID_LIVE_TRANSCRIPTION_ENABLED==='true'/);
 assert.match(api,/process\.env\.DAVID_LIVE_COACH_ENABLED==='true'/);
 assert.match(api,/scope:type/);
 assert.match(api,/transcriptionEngine:'google',track:'both_tracks',partialResults:false/);
 assert.match(api,/inboundTrackLabel:'operator',outboundTrackLabel:'client'/);
 assert.match(api,/language==='bg-BG'\?\{speechModel:'short'\}/);
});
test('Unsigned webhooks rejected and AI only processes final client utterances',()=>{
 assert.match(api,/if\(!checkTwilio\(req,'live-transcript'\)\)return response\(res,403/);
 assert.match(api,/String\(b\.Final\)\.toLowerCase\(\)!=='true'/);
 assert.match(api,/b\.Track==='outbound_track'\?'client'/);
 assert.match(api,/b\.Track==='inbound_track'\?'operator'/);
 assert.match(api,/speaker==='client'&&process\.env\.DAVID_LIVE_COACH_ENABLED==='true'/);
 assert.match(api,/onConflict:'call_sid,transcription_sid,sequence_id',ignoreDuplicates:true/);
 assert.doesNotMatch(api,/client\.calls\(sid\)\.transcriptions\.create\(\{[\s\S]{0,400}recordingChannels/);
});
test('Live AI runs in human-only suggestion mode and never autonomously speaks',()=>{
 assert.match(api,/silent assistant to a HUMAN/);
 assert.match(api,/respond specifically/i);
 assert.match(api,/hedgeAfterMs:500/);
 assert.match(api,/transcript_segment_id:segment\.id,suggestion:output/);
 assert.match(ui,/AI не говори по телефона/);
});


test('Live status is scoped to the current operator, even when the account is an admin',()=>{
 assert.match(api,/\.eq\('worker_user_id',a\.user\.id\)/);
 assert.match(api,/reason:'no_active_call'/);
 assert.match(api,/\.gte\('started_at',new Date\(Date\.now\(\)-20\*60\*1000\)\.toISOString\(\)\)/);
});
test('No-call screen links to the real Free Call dialer and checks Twilio/task approval',()=>{
 assert.match(ui,/#deskCallStart/);
 assert.match(ui,/Провери Twilio и задача/);
 assert.match(ui,/task-preflight/);
 assert.match(ui,/approved_task_missing/);
 assert.match(ui,/Не може да се набере още/);
 assert.match(ui,/lastCaptionSignature='missing_stt'/);
});

test('Free Call admin can load only their own approved task while Twilio keeps strict matching',()=>{
 const compiled=readFileSync(new URL('../recovery/compiled-frontend/assets/index-p3-2.js',import.meta.url),'utf8');
 assert.match(compiled,/includes\(g\.role\)\?'<div class="card" id="deskWorkerTask"/);
 assert.match(compiled,/if\(!\["worker","admin"\]\.includes\(g\.role\)\)/);
 assert.match(compiled,/auth\.dialTo!==requested/);
 assert.match(compiled,/Номерът трябва да съвпада с назначения от Admin номер/);
});
