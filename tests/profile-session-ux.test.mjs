import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const profile=readFileSync(new URL('../src/profile-gemini-entry.mjs',import.meta.url),'utf8');
const gemini=readFileSync(new URL('../src/operator-api-panel.mjs',import.meta.url),'utf8');

test('profile confirmation is scoped to a Supabase login session, not to an email alone',()=>{
 assert.match(profile,/PROFILE_MARKER_PREFIX/);
 assert.match(profile,/JSON\.parse\(atob\(part\)\)\.session_id/);
 assert.match(profile,/s\.user\.id\+':\'\+id/);
 assert.match(profile,/sessionStorage\.getItem\(key\)===\x27yes\x27/);
 assert.match(profile,/sessionStorage\.setItem\(key,\x27yes\x27\)/);
 assert.match(profile,/event!==\x27SIGNED_OUT\x27/);
 assert.match(profile,/sessionStorage\.removeItem\(key\)/);
});

test('save hides the form only after the backend confirms and keeps the success tick visible',()=>{
 assert.match(profile,/if\(data\.saved!==true\)throw Error/);
 assert.match(profile,/confirmSession\(now\);\s*showForm\(false\);\s*showConfirmed\(true\)/);
 assert.match(profile,/const saved=isConfirmed\(s\)&&validSavedProfile\(p\)/);
 assert.match(profile,/showForm\(!saved\);\s*showConfirmed\(saved\)/);
 assert.match(profile,/id="david-personal-profile" hidden style="display:none"/);
});

test('Gemini key is never persisted in browser storage and its completed form collapses to a tick',()=>{
 assert.match(profile,/geminiConnected\(data\.connected===true\)/);
 assert.match(profile,/result\.saved!==true/);
 assert.match(profile,/geminiConnected\(true\)/);
 assert.match(profile,/geminiSetup\.style\.display=connected\?\x27none\x27:\x27block\x27/);
 assert.match(profile,/geminiForm\.elements\.namedItem\(\x27key\x27\)\.value=\x27\x27/);
 assert.doesNotMatch(profile,/localStorage\.setItem/);
 assert.doesNotMatch(profile,/sessionStorage\.setItem\([^,]+,\s*key\)/);
 assert.match(gemini,/entry\.hidden=true;entry\.style\.display=\x27none\x27/);
});
