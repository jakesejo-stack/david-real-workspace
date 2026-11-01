import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/david-sales-flow-entry.mjs',import.meta.url),'utf8');
const detail=readFileSync(new URL('../src/david-call-intelligence-entry.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/server/david-live-calls.mjs',import.meta.url),'utf8');

test('Admin Call Records uses one compact searchable table rather than separate audio cards',()=>{
 assert.match(ui,/function mountAdmin\(root\)/);
 assert.match(ui,/el\('table','sf-admin-call-table'\)/);
 assert.match(ui,/el\('tbody'\)/);
 assert.match(ui,/tbody\.append\(tr\)/);
 assert.match(ui,/for\(const name of \['Дата и час','Оператор'/);
 assert.match(ui,/onlyAudio\.addEventListener\('change',render\)/);
 assert.match(ui,/tr\.addEventListener\('click',\(\)=>openDetails\(c,button\)\)/);
 assert.doesNotMatch(ui,/function createAdminAudioPanel\(/);
});

test('Each admin table row opens the existing modal and loads authorized audio without autoplay',()=>{
 assert.match(ui,/new CustomEvent\('david:open-call'/);
 assert.match(ui,/autoLoadAudio:!!call\.has_audio/);
 assert.match(detail,/async function openCall\(sid,trigger,overview=null,autoLoadAudio=false\)/);
 assert.match(detail,/callApi\('call-detail',\{sid\}\)/);
 assert.match(detail,/if\(autoLoadAudio&&startAudioLoad\)startAudioLoad\(\)/);
 assert.match(detail,/if\(data\.audio_access===true\)/);
 assert.match(detail,/audio\.controls=true/);
 assert.doesNotMatch(detail,/audio\.play\(\)/);
});

test('Popup shows entire call details, notes, audio duration, and transcript when present',()=>{
 assert.match(detail,/field\('Оператор',overview\.worker_name\)/);
 assert.match(detail,/field\('Реален разговор'/);
 assert.match(detail,/field\('Набран номер',overview\.dialed_number\)/);
 assert.match(detail,/sectionTitle\('🎧 Аудиозапис на разговора'\)/);
 assert.match(detail,/sectionTitle\('Пълен разговор и DAVID подсказки'\)/);
 assert.match(detail,/sectionTitle\('Резултат и бележка'\)/);
 assert.match(detail,/david-ci-playback-clock/);
 assert.match(detail,/holder\.replaceChildren\(audio,playbackClock,duration/);
});

test('Popup does not keep a private audio response after close',()=>{
 assert.match(detail,/if\(shell\.style\.display!=='flex'\|\|!holder\.isConnected\)return/);
 assert.match(detail,/URL\.revokeObjectURL\(playerBlob\)/);
 assert.match(ui,/document\.getElementById\('david-call-modal'\)\?\.style\.display==='flex'/);
});

test('Private audio is always authorized on the server with temporary signed URLs',()=>{
 assert.match(api,/async function browserLink\(req,res,a\)/);
 assert.match(api,/if\(!canAccessCallAudio\(a\.role\)\)return response\(res,403/);
 assert.match(api,/createSignedUrl\(r\.object_path,60\)/);
 assert.match(api,/if\(a\.role!=='admin'\)return response\(res,403/);
});

test('Call Records history also uses a table that opens shared details popup',()=>{
 assert.match(detail,/node\('table','david-ci-table'\)/);
 assert.match(detail,/tr\.addEventListener\('click',\(\)=>openRecord\(s,button\)\)/);
});
