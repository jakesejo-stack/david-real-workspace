import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const mic=readFileSync(new URL('../src/david-microphone-live-captions.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/david-call-intelligence-entry.mjs',import.meta.url),'utf8');

test('operator microphone has independent realtime interim captions before a phone call',()=>{
 assert.match(mic,/window\.SpeechRecognition\|\|window\.webkitSpeechRecognition/);
 assert.match(mic,/r\.continuous=true;r\.interimResults=true/);
 assert.match(mic,/r\.lang=language\.value\|\|'bg-BG'/);
 assert.match(mic,/r\.onresult=event=>/);
 assert.match(mic,/!entry\.isFinal/);
 assert.match(mic,/history\.append\(element\('p','david-mic-final'/);
 assert.match(ui,/mountMicrophoneLiveCaptions/);
 assert.match(ui,/panel.append\(meta,permissions,micPreview\.view,customer,operator,captionHead,captions/);
 assert.match(ui,/micPreview\.getText\(\)/);
});

test('automatic microphone recognition requires previously granted browser permission',()=>{
 assert.match(mic,/navigator\.permissions\.query\(\{name:'microphone'\}\)/);
 assert.match(mic,/permission\.state==='granted'/);
 assert.match(mic,/wanted=true;beginRecognition\(\)/);
 assert.match(mic,/Натисни „Включи микрофона“/);
 assert.match(mic,/permission\.state==='denied'/);
 assert.match(mic,/r\.onerror/);
 assert.match(mic,/not-allowed/);
});

test('microphone previews are not sent to call record storage or Twilio as client speech',()=>{
 assert.match(mic,/Local preview text is never submitted to DAVID/);
 assert.doesNotMatch(mic,/fetch\s*\(/);
 assert.doesNotMatch(mic,/localStorage\.setItem/);
 assert.doesNotMatch(mic,/sessionStorage\.setItem/);
 assert.match(ui,/Оператор · моят микрофон:/);
 assert.match(ui,/Клиент: /);
});

test('headphone monitoring is opt-in and stops all microphone tracks',()=>{
 assert.match(mic,/Чувам себе си/);
 assert.match(mic,/window\.confirm\('Включи слушалки/);
 assert.match(mic,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(mic,/audioSource\.connect\(audioGain\);audioGain\.connect\(audioContext\.destination\)/);
 assert.match(mic,/for\(const track of audioStream\.getTracks\(\)\)track\.stop\(\)/);
 assert.match(mic,/document\.addEventListener\('visibilitychange',onVisibility\)/);
 assert.match(mic,/if\(!panel\.isConnected\)cleanup\(\)/);
 assert.match(ui,/micPreview\.stop\(\)/);
});

test('remote Twilio client transcription remains independent and requires an authorized call',()=>{
 assert.match(ui,/callApi\('live-consent'/);
 assert.match(ui,/renderCaptions\(data\.transcript,active\)/);
 assert.match(mic,/не гласа на клиента/);
});
