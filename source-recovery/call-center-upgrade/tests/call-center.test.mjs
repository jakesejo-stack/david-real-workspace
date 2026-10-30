import test from 'node:test';
import assert from 'node:assert/strict';
import {callReadiness,isAdmin,normalizeDialNumber,assignedNumber,canStartTaskCall} from '../public/david-modules/call-center-upgrade.mjs';
const config={databaseConfigured:true,serverConfigured:true,telephonyConfigured:true,liveCallsEnabled:true};
const state={config,role:'worker',davidDailyTask:{title:'Тест',instructions:'Обади се на +359888000000'}};
test('all four readiness checks must pass; missing or string values fail closed',()=>{
 assert.equal(callReadiness(config).ready,true);
 for(const key of Object.keys(config)){assert.equal(callReadiness({...config,[key]:false}).ready,false);assert.equal(callReadiness({...config,[key]:'true'}).ready,false)}
 assert.equal(callReadiness().ready,false);
});
test('admin navigation requires both server role and an exact approved email',()=>{
 assert.equal(isAdmin({role:'admin',user:{email:'soulflame.mitko@gmail.com'}}),true);
 assert.equal(isAdmin({role:'worker',user:{email:'soulflame.mitko@gmail.com'}}),false);
 assert.equal(isAdmin({role:'admin',user:{email:'someone@gmail.com'}}),false);
});
test('normalize Bulgarian and international numbers without accepting extensions or partial numbers',()=>{
 assert.equal(normalizeDialNumber('0888 000 000'),'+359888000000');
 assert.equal(normalizeDialNumber('00359 888 000 000'),'+359888000000');
 assert.equal(normalizeDialNumber('+34 (600) 111-222'),'+34600111222');
 for(const invalid of ['abc','123','+359888000000 ext 2','+0000000','+1234567890123456'])assert.equal(normalizeDialNumber(invalid),'');
});
test('only the assigned number can start a call, and busy/revoked/unconfigured states cannot dial',()=>{
 assert.equal(assignedNumber(state.davidDailyTask),'+359888000000');
 assert.equal(canStartTaskCall(state,'0888 000 000'),true);
 assert.equal(canStartTaskCall(state,'+359888000001'),false);
 for(const change of [{call:{}},{taskCallBusy:true},{role:'admin'},{davidDailyTask:null},{config:{}}])assert.equal(canStartTaskCall({...state,...change},'+359888000000'),false);
});
