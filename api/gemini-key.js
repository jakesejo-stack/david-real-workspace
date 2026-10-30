import {createClient} from '@supabase/supabase-js';
import {createCipheriv,randomBytes,createHash} from 'node:crypto';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const url=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY;
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY,secret=process.env.GEMINI_KEY_ENCRYPTION_SECRET;
 if(!url||!anon||!service||!secret)return res.status(503).json({error:'Secure Gemini storage is not configured'});
 const bearer=/^Bearer (.+)$/.exec(String(req.headers.authorization||''));
 if(!bearer)return res.status(401).json({error:'Google login required'});
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(bearer[1]);
 if(authError||!user?.id||!user.email_confirmed_at||!user.app_metadata?.providers?.includes('google'))
  return res.status(401).json({error:'Verified Google login required'});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:member,error:memberError}=await admin.from('david_members').select('role').eq('user_id',user.id).maybeSingle();
 if(memberError||!member)return res.status(403).json({error:'Approved member required'});
 if(req.query?.mode==='history'&&req.method==='GET'){
  const {data,error}=await admin.from('david_ai_messages').select('id,role,content,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
  if(error)return res.status(500).json({error:'Неуспешно зареждане на историята'});
  return res.status(200).json({messages:(data||[]).reverse()});
 }
 if(req.query?.mode==='profile'){
  if(req.method==='GET'){
   const {data,error}=await admin.from('david_ai_profiles').select('full_name,city,phone,gmail').eq('user_id',user.id).maybeSingle();
   if(error)return res.status(500).json({error:'Неуспешно зареждане на профила'});
   return res.status(200).json({profile:data||{full_name:user.user_metadata?.full_name||'',city:'',phone:'',gmail:user.email||''},verifiedEmail:user.email||''});
  }
  const full_name=String(req.body?.full_name||'').trim().slice(0,120);
  const city=String(req.body?.city||'').trim().slice(0,100);
  const phone=String(req.body?.phone||'').trim().slice(0,40);
  if(!full_name||!city||!/^[+0-9 ()-]{6,40}$/.test(phone))return res.status(400).json({error:'Попълни имена, град и валиден телефон'});
  const {error}=await admin.from('david_ai_profiles').upsert({user_id:user.id,full_name,city,phone,gmail:user.email||'',updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)return res.status(500).json({error:'Неуспешно записване на профила'});
  return res.status(200).json({saved:true});
 }
 if(req.method==='GET'){
  const {data,error}=await admin.from('david_operator_gemini_keys').select('user_id').eq('user_id',user.id).maybeSingle();
  if(error)return res.status(500).json({error:'Storage unavailable'});
  return res.status(200).json({connected:!!data});
 }
 if(typeof req.body?.key!=='string'||!/^(?:AIza[\w-]{20,}|AQ\.[A-Za-z0-9._-]{20,})$/.test(req.body.key)||req.body.key.length>256)
  return res.status(400).json({error:'Invalid Gemini API key'});
 let master;
 try{
  const normalized=secret.trim();
  const decoded=Buffer.from(normalized,'base64');
  if(decoded.length===32 && decoded.toString('base64')===normalized) master=decoded;
  else if(normalized.length>=32) master=createHash('sha256').update(normalized,'utf8').digest();
  else throw Error('Encryption secret too short');
 }catch{return res.status(503).json({error:'Encryption secret must be 32 random bytes in Base64 or at least 32 random characters'});}
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master,iv);
 const encrypted=Buffer.concat([cipher.update(req.body.key,'utf8'),cipher.final()]);
 const payload=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
 const {error}=await admin.from('david_operator_gemini_keys').upsert({user_id:user.id,encrypted_key:payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error)return res.status(500).json({error:'Storage unavailable'});
 return res.status(200).json({saved:true});
}
