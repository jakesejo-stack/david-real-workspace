import {send,required,env} from './_lib.js';
export default async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
 const auth=required(['SUPABASE_URL','SUPABASE_ANON_KEY']).length===0;
 const server=required(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']).length===0;
 const liveCallsEnabled=env('LIVE_CALLS_ENABLED')==='true';
 const telephony=server&&liveCallsEnabled&&required(['TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_AUTH_TOKEN','TWILIO_TWIML_APP_SID','TWILIO_FROM_NUMBER','PUBLIC_ORIGIN']).length===0;
 return send(res,200,{databaseConfigured:auth,serverConfigured:server,telephonyConfigured:telephony,liveCallsEnabled,
  supabaseUrl:auth?env('SUPABASE_URL'):'',supabaseAnonKey:auth?env('SUPABASE_ANON_KEY'):'',
  recordingEnabled:env('ENABLE_RECORDING')==='true'});
}