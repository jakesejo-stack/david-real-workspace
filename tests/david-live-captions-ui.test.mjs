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
test('Only authorized, active transcription is rendered, without audio-recording consent requirement',()=>{
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
test('No-call captions remain functional without redundant dialer/preflight banner',()=>{
 assert.doesNotMatch(ui,/david-ci-start-help/);
 assert.doesNotMatch(ui,/Провери Twilio и задача/);
 assert.doesNotMatch(ui,/#deskCallStart/);
 assert.match(ui,/Телефонът е свободен/);
 assert.match(ui,/Live Captions · Двата гласа/);
 assert.match(ui,/lastCaptionSignature='missing_stt'/);
});

test('Free Call admin can load only their own approved task while Twilio keeps strict matching',()=>{
 const compiled=readFileSync(new URL('../recovery/compiled-frontend/assets/index-p3-2.js',import.meta.url),'utf8');
 assert.match(compiled,/includes\(g\.role\)\?'<div class="card" id="deskWorkerTask"/);
 assert.match(compiled,/if\(!\["worker","admin"\]\.includes\(g\.role\)\)/);
 assert.match(compiled,/auth\.dialTo!==requested/);
 assert.match(compiled,/Номерът трябва да съвпада с назначения от Admin номер/);
});

test('Live Captions are permanently visible; they stay off without an active call',()=>{
 assert.match(ui,/const permissions=node\('div','david-ci-permissions'\);/);
 assert.match(ui,/const listen=node\('button','btn primary','▶ Live Captions'\);/);
 assert.match(ui,/callSid=null;listen.disabled=activationPending;listen.textContent='▶ Live Captions';record.disabled=true;/);
 assert.match(ui,/listen.disabled=activationPending\|\|!!data.transcription_active/);
 assert.doesNotMatch(ui,/Потвърди съгласие за транскрипция/);
 assert.doesNotMatch(ui,/scope==='recording'\?'.+':'Клиентът изрично разреши ли речта/);
});
test('Operator can start consent-independent captions after notice and lawful basis attestation',()=>{
 assert.match(ui,/scope==='transcription'\?\{noticeDelivered:true,lawfulBasisConfirmed:true\}:\{clientConfirmed:true\}/);
 assert.match(api,/b.noticeDelivered!==true\|\|b.lawfulBasisConfirmed!==true/);
 assert.match(api,/transcription_notice_and_lawful_basis_required/);
 assert.match(api,/operator_attested_notice_and_lawful_basis/);
 assert.match(ui,/▶ Live Captions/);
 assert.match(ui,/Аудиозаписът изисква отделно изрично разрешение/);
});
test('Audio recording still requires distinct affirmative permission',()=>{
 assert.match(ui,/scope==='recording'&&!window.confirm/);
 assert.match(api,/type==='recording'&&b.clientConfirmed!==true/);
 assert.match(api,/explicit_recording_permission_required/);
 assert.match(api,/operator_attested_explicit_recording_permission/);
});

test('operator always sees live caption controls before transcript while idle',()=>{
 assert.match(ui,/panel.append\(meta,permissions,customer,operator,captionHead,captions/);
 assert.match(ui,/\.david-ci-captions\.is-idle\{height:112px\}/);
 assert.match(ui,/Първо започни обаждане от телефонния панел/);
 assert.match(ui,/dial\.scrollIntoView/);
 assert.match(ui,/Изчакай другият човек да вдигне/);
 assert.doesNotMatch(ui,/listen.disabled=data.state!=='in-progress'/);
 assert.match(api,/if\(live.status!=='in-progress'\)return response\(res,409/);
});
