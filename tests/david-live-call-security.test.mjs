import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCallIntelligence} from '../src/server/david-live-calls.mjs';

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
