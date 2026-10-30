import {requireMember} from './_david-member.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 try{
  const {user,admin}=await requireMember(req);
  if(req.method==='GET'){
   const {data,error}=await admin.from('david_ai_profiles').select('full_name,city,phone,gmail').eq('user_id',user.id).maybeSingle();
   if(error)throw Error('Profile storage unavailable');
   return res.status(200).json({profile:data||{full_name:user.user_metadata?.full_name||'',city:'',phone:'',gmail:user.email||''},verifiedEmail:user.email||''});
  }
  const values=req.body||{};
  const full_name=String(values.full_name||'').trim().slice(0,120);
  const city=String(values.city||'').trim().slice(0,100);
  const phone=String(values.phone||'').trim().slice(0,40);
  const gmail=user.email||'';
  if(!full_name||!city||!/^\+?[0-9 ()-]{6,40}$/.test(phone))return res.status(400).json({error:'Попълни имена, град и валиден телефон.'});
  const {error}=await admin.from('david_ai_profiles').upsert({user_id:user.id,full_name,city,phone,gmail,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw Error('Profile save failed');
  return res.status(200).json({saved:true,profile:{full_name,city,phone,gmail}});
 }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Неуспешно зареждане или записване на профила.'});}
}
