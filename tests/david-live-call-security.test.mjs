import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCallIntelligence,canAccessCallAudio} from '../src/server/david-live-calls.mjs';
import davIdHandler from '../api/integrations/david/[action].js';

function mockResponse(){
 return {
  headers:{},statusCode:200,body:null,
  setHeader(k,v){this.headers[k]=v;return this},
  status(n){this.statusCode=n;return this},
  json(value){this.body=value;return this},
  send(value){this.body=value;return this}
 };
}
test('unsupported DAVID call route is not intercepted',async()=>{
 const res=mockResponse();
 assert.equal(await handleCallIntelligence({method:'GET',headers:{},query:{}},res,'unknown-action'),null);
});
test('call records never allow unauthenticated access',async()=>{
 const res=mockResponse();
 await handleCallIntelligence({method:'GET',headers:{},query:{}},res,'call-records');
 assert.equal(res.statusCode,403);
 assert.equal(res.body.error,'approved_active_google_member_required');
});
test('live consent requires verified Google member',async()=>{
 const res=mockResponse();
 await handleCallIntelligence({method:'POST',headers:{},body:{call_sid:'CA'+'0'.repeat(32),clientConfirmed:true},query:{}},res,'live-consent');
 assert.equal(res.statusCode,403);
});
test('transcription webhook requires signed Twilio callback and matching account',async()=>{
 const res=mockResponse();
 await handleCallIntelligence({method:'POST',headers:{},body:{AccountSid:'AC'+'0'.repeat(32)},query:{}},res,'live-transcript');
 assert.equal(res.statusCode,403);
 assert.equal(res.body.error,'twilio_signature_invalid');
});
test('recording callback requires signed Twilio callback',async()=>{
 const res=mockResponse();
 await handleCallIntelligence({method:'POST',headers:{},body:{},query:{}},res,'live-recording-status');
 assert.equal(res.statusCode,403);
});

test('audio permissions are admin-only regardless of UI visibility',()=>{
 assert.equal(canAccessCallAudio('worker'),false);
 assert.equal(canAccessCallAudio('operator'),false);
 assert.equal(canAccessCallAudio(undefined),false);
 assert.equal(canAccessCallAudio('admin'),true);
});
for(const route of ['browser-record-prepare','browser-record-complete','browser-record-link','live-audio','call-outcome','company-history','admin-inbox','admin-mark-read']){
 test(route+' rejects unauthenticated callers before DB access',async()=>{
  const res=mockResponse();
  await handleCallIntelligence({method:'GET',headers:{},query:{}},res,route);
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'approved_active_google_member_required');
 });
}

test('Twilio preflight checks Google authentication before revealing account status',async()=>{
 const res=mockResponse();
 await davIdHandler({method:'GET',headers:{},query:{action:'task-preflight'}},res);
 assert.equal(res.statusCode,401);
 assert.equal(res.body.error,'google_login_required');
});
test('Twilio preflight never accepts a POST',async()=>{
 const res=mockResponse();
 await davIdHandler({method:'POST',headers:{},query:{action:'task-preflight'}},res);
 assert.equal(res.statusCode,405);
});

test('Twilio conference callbacks reject unsigned requests',async()=>{
 for(const action of ['task-child-status','task-conference-status']){
  const res=mockResponse();
  await davIdHandler({method:'POST',headers:{},body:{AccountSid:'AC'+'0'.repeat(32),CallSid:'CA'+'0'.repeat(32)},query:{action}},res);
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'invalid_twilio_signature');
 }
});
test('Conference action fails closed while feature disabled',async()=>{
 const old=process.env.DAVID_CONFERENCE_CALLS_ENABLED;
 process.env.DAVID_CONFERENCE_CALLS_ENABLED='false';
 try{
  for(const action of ['task-control-status','task-hold','task-transfer']){
   const res=mockResponse();
   const method=action==='task-control-status'?'GET':'POST';
   await davIdHandler({method,headers:{},query:{action},body:{}},res);
   assert.equal(res.statusCode,409);
   assert.equal(res.body.error,'conference_mode_not_activated');
  }
 }finally{
  if(old===undefined)delete process.env.DAVID_CONFERENCE_CALLS_ENABLED;
  else process.env.DAVID_CONFERENCE_CALLS_ENABLED=old;
 }
});
