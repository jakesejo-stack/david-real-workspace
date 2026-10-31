import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/david-sales-flow-entry.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/server/david-live-calls.mjs',import.meta.url),'utf8');

test('Admin audio record expands to a native playback field with visible controls',()=>{
 assert.match(ui,/function createAdminAudioPanel\(call\)/);
 assert.match(ui,/el\('details','sf-admin-audio-panel'\)/);
 assert.match(ui,/el\('summary','sf-admin-audio-toggle'\)/);
 assert.match(ui,/player\.controls=true/);
 assert.match(ui,/card\.append\(recording,createAdminAudioPanel\(c\)\)/);
});

test('Listening in an expanded panel is not interrupted by polling',()=>{
 assert.match(ui,/list\.querySelector\('details\.sf-admin-audio-panel\[open\]'\)/);
 assert.match(ui,/player\.pause\(\)/);
 assert.match(ui,/reload\.addEventListener\('click',load\)/);
});

test('Private browser audio can only be opened with admin authorization and a fresh signed link',()=>{
 assert.match(api,/async function browserLink\(req,res,a\)/);
 assert.match(api,/if\(!canAccessCallAudio\(a\.role\)\)return response\(res,403/);
 assert.match(api,/createSignedUrl\(r\.object_path,60\)/);
});
