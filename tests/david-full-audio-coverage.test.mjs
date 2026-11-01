import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatAudioClock,finalizeBrowserAudio,preparePlaybackBlob} from '../src/david-audio-completeness.mjs';

const frontend=readFileSync(new URL('../src/david-sales-flow-entry.mjs',import.meta.url),'utf8');
const detail=readFileSync(new URL('../src/david-call-intelligence-entry.mjs',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/server/david-live-calls.mjs',import.meta.url),'utf8');

test('DAVID audio clock uses full minutes and seconds',()=>{
 assert.equal(formatAudioClock(0),'00:00');
 assert.equal(formatAudioClock(106000),'01:46');
 assert.equal(formatAudioClock(300000),'05:00');
});

test('Local media is preserved if no duration repair is needed',async()=>{
 const blob=new Blob([new Uint8Array(2048)],{type:'audio/ogg'});
 assert.strictEqual(await finalizeBrowserAudio(blob,106000),blob);
 const prepared=await preparePlaybackBlob(blob);
 assert.strictEqual(prepared.blob,blob);
});

test('Recorded audio starts only after verbal client consent and continues until hangup',()=>{
 assert.match(frontend,/clientConfirmed:true,noticeVersion:'david-v1',method:'verbal'/);
 assert.match(frontend,/stopBrowserRecording\('call_ended'\)/);
 assert.match(frontend,/recorder\.start\(1000\)/);
 assert.match(frontend,/entry\.startedMono=performance\.now\(\)/);
 assert.match(frontend,/entry\.stopReason='limit'/);
 assert.match(frontend,/stopBrowserRecording\('manual_stop'\)/);
 assert.doesNotMatch(frontend,/rec\.pause\(\)/);
 assert.match(frontend,/finalizeBrowserAudio\(captured,elapsedMs\)/);
 assert.match(frontend,/duration_ms:elapsedMs/);
});

test('Admin popup downloads the complete authorized file and keeps its actual media duration',()=>{
 assert.match(detail,/const link=await callApi\('browser-record-link'/);
 assert.match(detail,/resp=await fetch\(link.url,\{cache:'no-store'\}\)/);
 assert.match(detail,/const blob=await resp.blob\(\)/);
 assert.match(detail,/preparePlaybackBlob\(blob\)/);
 assert.match(detail,/playerBlob=URL.createObjectURL\(prepared.blob\)/);
 assert.match(detail,/audio.controls=true/);
 assert.match(detail,/audio.preload='auto'/);
 assert.match(detail,/Записът започва след съгласие/);
 assert.match(detail,/if\(shell.style.display!=='flex'\|\|!holder.isConnected\)return/);
 assert.doesNotMatch(detail,/audio.play\(\)/);
});

test('Server persists recording duration and reason with admin-only playback',()=>{
 assert.match(server,/record_duration_ms:duration/);
 assert.match(server,/record_ended_reason:endedReason/);
 assert.match(server,/if\(!canAccessCallAudio\(a\.role\)\)return response\(res,403/);
});
