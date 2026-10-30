import {requireMember} from './_david-member.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{
  const {user,admin}=await requireMember(req);
  const {data,error}=await admin.from('david_ai_messages').select('id,role,content,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
  if(error)throw Error('History lookup failed');
  return res.status(200).json({messages:(data||[]).reverse()});
 }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Неуспешно зареждане на историята.'});}
}
