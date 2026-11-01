import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOperatorCoachPrompt} from '../src/david-gemini-text-coach.mjs';
test('operator only, no audio and no invented claims',()=>{const s=buildOperatorCoachPrompt({sector:'scooter batteries',stage:'opening'});assert.match(s,/HUMAN operator/);assert.match(s,/No audio output/);assert.match(s,/No invented facts/)});
test('reject unsupported stages and obvious personal data',()=>{assert.throws(()=>buildOperatorCoachPrompt({stage:'call_now'}));assert.throws(()=>buildOperatorCoachPrompt({operatorNote:'john@example.com'}));assert.throws(()=>buildOperatorCoachPrompt({operatorNote:'+359888123456'}));});
