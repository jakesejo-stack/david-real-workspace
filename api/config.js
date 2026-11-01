// DAVID public browser bootstrap: booleans only, never expose Twilio secrets.
const requiredTwilio=[
 'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID',
 'TWILIO_API_KEY_SECRET','TWILIO_TASK_TWIML_APP_SID','TWILIO_FROM_NUMBER',
 'PUBLIC_ORIGIN','DPP_TASK_ALLOWED_NUMBERS'
];
export function publicReadiness(env){
 const databaseConfigured=Boolean(env.SUPABASE_URL&&env.SUPABASE_ANON_KEY);
 const credentialsConfigured=requiredTwilio.every(key=>Boolean(String(env[key]||'').trim()));
 const liveCallsEnabled=env.LIVE_CALLS_ENABLED==='true';
 const isCanonicalOrigin=String(env.PUBLIC_ORIGIN||'').replace(/\/$/,'')==='https://david-real-workspace.vercel.app';
 const telephonyConfigured=databaseConfigured&&credentialsConfigured&&liveCallsEnabled&&isCanonicalOrigin;
 return {
  databaseConfigured,
  serverConfigured:databaseConfigured&&Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  telephonyConfigured,
  liveCallsEnabled:telephonyConfigured,
  recordingEnabled:telephonyConfigured&&env.ENABLE_RECORDING==='true'&&env.DAVID_LIVE_RECORDING_ENABLED==='true',
  configurationState:!databaseConfigured?'database_missing':
   !credentialsConfigured?'twilio_credentials_missing':
   !isCanonicalOrigin?'public_origin_mismatch':
   !liveCallsEnabled?'live_calls_disabled':'ready'
 };
}
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const readiness=publicReadiness(process.env);
 return res.status(200).json({
  ...readiness,
  supabaseUrl:String(process.env.SUPABASE_URL||''),
  supabaseAnonKey:String(process.env.SUPABASE_ANON_KEY||'')
 });
}
