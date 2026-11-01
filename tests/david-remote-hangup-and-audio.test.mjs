import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sales=readFileSync(new URL('../src/david-sales-flow-entry.mjs',import.meta.url),'utf8');
const callModal=readFileSync(new URL('../src/david-call-intelligence-entry.mjs',import.meta.url),'utf8');
const conference=readFileSync(new URL('../src/server/david-conference-controls.mjs',import.meta.url),'utf8');
const intelligence=readFileSync(new URL('../src/server/david-live-calls.mjs',import.meta.url),'utf8');

test('A customer hangup ends the browser operator connection instead of leaving them in a conference',()=>{
 assert.match(conference,/async function closeOperatorOnCustomerHangup\(/);
 assert.match(conference,/calls\(c\.parent_call_sid\)\.update\(\{status:'completed'\}\)/);
 assert.match(conference,/event==='participant-leave'/);
 assert.match(conference,/customer_hangup_sync_failed/);
 assert.match(conference,/c\.transfer_status==='dialing'/);
});

test('Every Twilio SDK end event enters post-call workflow exactly once',()=>{
 assert.match(sales,/let finished=false/);
 assert.match(sales,/if\(finished\)return/);
 assert.match(sales,/new CustomEvent\('david:call-ended'/);
 assert.match(sales,/document\.addEventListener\('david:call-ended',handleEndEvent\)/);
 assert.match(sales,/showEndedWaiting\(\)/);
 assert.match(sales,/openEndedResult\(latest\)/);
 assert.match(sales,/outcomePanel\.scrollIntoView/);
});

test('Private DAVID audio is available in admin call detail without a Twilio provider recording',()=>{
 assert.match(intelligence,/browser_recording:mayHearAudio\?browserRecording:null/);
 assert.match(intelligence,/a\.db\.from\('david_browser_recordings'\)/);
 assert.match(callModal,/const browserRecording=data\.browser_recording\?\.status==='completed'/);
 assert.match(callModal,/callApi\('browser-record-link'/);
 assert.match(callModal,/audio\.controls=true/);
});
