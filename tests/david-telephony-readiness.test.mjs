import test from 'node:test';
import assert from 'node:assert/strict';
import {publicReadiness} from '../api/config.js';
const ready={
 SUPABASE_URL:'https://sample.supabase.co',SUPABASE_ANON_KEY:'public-anon',
 SUPABASE_SERVICE_ROLE_KEY:'server-only',
 TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),
 TWILIO_AUTH_TOKEN:'secret-not-exposed',
 TWILIO_API_KEY_SID:'SK'+'2'.repeat(32),
 TWILIO_API_KEY_SECRET:'secret-not-exposed',
 TWILIO_TASK_TWIML_APP_SID:'AP'+'3'.repeat(32),
 TWILIO_FROM_NUMBER:'+359888123456',
 PUBLIC_ORIGIN:'https://david-real-workspace.vercel.app',
 DPP_TASK_ALLOWED_NUMBERS:'+359888654321',
 LIVE_CALLS_ENABLED:'true',
 ENABLE_RECORDING:'false'
};
test('no secrets or telephony by default',()=>{
 const state=publicReadiness({});
 assert.equal(state.telephonyConfigured,false);
 assert.equal(state.configurationState,'database_missing');
 assert.equal(Object.hasOwn(state,'TWILIO_AUTH_TOKEN'),false);
});
test('missing Twilio credentials show not configured',()=>{
 const state=publicReadiness({SUPABASE_URL:ready.SUPABASE_URL,SUPABASE_ANON_KEY:ready.SUPABASE_ANON_KEY});
 assert.equal(state.telephonyConfigured,false);
 assert.equal(state.configurationState,'twilio_credentials_missing');
});
test('only fully enabled and configured production can show Twilio connected',()=>{
 assert.equal(publicReadiness(ready).telephonyConfigured,true);
 assert.equal(publicReadiness({...ready,LIVE_CALLS_ENABLED:'false'}).telephonyConfigured,false);
 assert.equal(publicReadiness({...ready,PUBLIC_ORIGIN:'https://preview.vercel.app'}).telephonyConfigured,false);
 assert.equal(publicReadiness({...ready,TWILIO_AUTH_TOKEN:''}).telephonyConfigured,false);
});
test('recordings need explicit additional feature flags',()=>{
 const x=publicReadiness({...ready,ENABLE_RECORDING:'true'});
 assert.equal(x.recordingEnabled,false);
 assert.equal(publicReadiness({...ready,ENABLE_RECORDING:'true',DAVID_LIVE_RECORDING_ENABLED:'true'}).recordingEnabled,true);
});
