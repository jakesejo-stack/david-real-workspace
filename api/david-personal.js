import {createClient} from '@supabase/supabase-js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 try{
  const url=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)return res.status(503).json({error:'Database configuration missing'});
  const token=/^Bearer (.+)$/.exec(String(req.headers.authorization||''))?.[1];
  if(!token)return res.status(401).json({error:'Google login required'});
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user?.id||!user.email_confirmed_at||!user.app_metadata?.providers?.includes('google'))return res.status(401).json({error:'Verified Google login required'});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await admin.from('david_members').select('role').eq('user_id',user.id).maybeSingle();
  if(memberError||!member)return res.status(403).json({error:'Approved DAVID member required'});
  if(req.method==='GET'&&req.query?.mode==='history'){
   const {data,error}=await admin.from('david_ai_messages').select('id,role,content,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
   if(error)throw Error('History unavailable');
   return res.status(200).json({messages:(data||[]).reverse()});
  }
  if(req.method==='GET'){
   const {data,error}=await admin.from('david_ai_profiles').select('full_name,city,phone,gmail').eq('user_id',user.id).maybeSingle();
   if(error)throw Error('Profile unavailable');
   return res.status(200).json({profile:data||{full_name:user.user_metadata?.full_name||'',city:'',phone:'',gmail:user.email||''},verifiedEmail:user.email||''});
  }
  const full_name=String(req.body?.full_name||'').trim().slice(0,120);
  const city=String(req.body?.city||'').trim().slice(0,100);
  const phone=String(req.body?.phone||'').trim().slice(0,40);
  if(!full_name||!city||!/^\+?[0-9 ()-]{6,40}$/.test(phone))return res.status(400).json({error:'Попълни имена, град и валиден телефон.'});
  const {error}=await admin.from('david_ai_profiles').upsert({user_id:user.id,full_name,city,phone,gmail:user.email||'',updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw Error('Profile save failed');
  return res.status(200).json({saved:true});
 }catch{return res.status(500).json({error:'Проблем със записването в Supabase.'});}
}
