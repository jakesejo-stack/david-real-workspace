
import {authorizedBridge,serviceClient,jsonBody,validCode,validExternalId,codeDigest,response} from '../../_david_link_shared.js';
export default async function handler(req,res){
 const action=req.query?.action;
 if(action==='redeem'&&req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(['me','assignments'].includes(action)&&req.method!=='GET')return response(res,405,{error:'method_not_allowed'});
 if(!['redeem','me','assignments'].includes(action))return response(res,404,{error:'not_found'});
 try {
  if(!authorizedBridge(req))return response(res,401,{error:'unauthorized'});
  const db=serviceClient();
  if(action==='redeem'){
   const b=jsonBody(req);
   if(!validCode(b.code)||!validExternalId(b.external_user_id))return response(res,400,{error:'invalid_request'});
   const {data,error}=await db.rpc('david_redeem_link_code',{
     p_code_hash:codeDigest(b.code),p_external_user_id:b.external_user_id});
   if(error)return response(res,503,{error:'verification_unavailable'});
   if(data?.ok!==true)return response(res,data?.reason==='rate_limited'?429:403,{error:data?.reason||'invalid_code'});
   return response(res,200,{worker_id:data.worker_id,organization_id:data.organization_id,
    role:data.role,active:data.active,external_user_id:data.external_user_id});
  }
  const externalId=req.headers['x-david-external-user-id'];
  if(!validExternalId(externalId))return response(res,400,{error:'invalid_external_user_id'});
  const {data:link,error:linkErr}=await db.rpc('david_verify_worker_link',{p_external_user_id:externalId});
  if(linkErr)return response(res,503,{error:'verification_unavailable'});
  if(link?.active!==true)return response(res,403,{error:'worker_not_active'});
  if(action==='me')return response(res,200,link);
  const {data:worker,error:workerErr}=await db.from('david_worker_identities')
    .select('user_id,organization_id,active').eq('worker_id',link.worker_id).eq('active',true).maybeSingle();
  if(workerErr||!worker||worker.organization_id!==link.organization_id)return response(res,403,{error:'worker_not_authorized'});
  const {data:companies,error}=await db.from('david_companies')
    .select('id,company_name,country,country_code,sector,contact_email,contact_phone,task,research_notes,calling_approved,do_not_call')
    .eq('assigned_to',worker.user_id).order('company_name').limit(500);
  if(error)return response(res,503,{error:'crm_unavailable'});
  return response(res,200,{worker_id:link.worker_id,organization_id:link.organization_id,
   companies:(companies||[]).map(c=>({
    company_id:c.id,name:c.company_name,country:c.country,country_code:c.country_code,
    sector:c.sector,contact_email:c.do_not_call?null:c.contact_email,
    contact_phone:c.calling_approved&&!c.do_not_call?c.contact_phone:null,
    task:c.task,research_notes:c.research_notes,
    calling_approved:c.calling_approved,do_not_call:c.do_not_call
   }))});
 } catch {return response(res,503,{error:'bridge_unavailable'})}
}
