// Public browser bootstrap configuration for the isolated operator CRM.
// Never send private Supabase service-role keys, Twilio secrets or credentials.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const supabaseUrl=String(process.env.SUPABASE_URL||'');
 const supabaseAnonKey=String(process.env.SUPABASE_ANON_KEY||'');
 const databaseConfigured=!!(supabaseUrl&&supabaseAnonKey);
 // Real calls must be disabled in this preview, even if production is configured.
 return res.status(200).json({
  databaseConfigured,
  serverConfigured:false,
  telephonyConfigured:false,
  liveCallsEnabled:false,
  supabaseUrl,
  supabaseAnonKey,
  recordingEnabled:false
 });
}
