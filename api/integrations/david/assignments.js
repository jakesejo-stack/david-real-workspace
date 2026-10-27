import {authorizedBridge,serviceClient,validExternalId,response} from '../../_david_link_shared.js';
// Only assigned CRM records for a currently active worker. Never expose all tenants.
export default async function handler(req,res) {
  if(req.method!=='GET') return response(res,405,{error:'method_not_allowed'});
  try{
    if(!authorizedBridge(req)) return response(res,401,{error:'unauthorized'});
    const externalId=req.headers['x-david-external-user-id'];
    if(!validExternalId(externalId)) return response(res,400,{error:'invalid_external_user_id'});
    const db=serviceClient();
    const {data:link,error:linkErr}=await db.rpc('david_verify_worker_link',{p_external_user_id:externalId});
    if(linkErr)return response(res,503,{error:'worker_validation_unavailable'});
    if(link?.active!==true)return response(res,403,{error:'worker_not_active'});
    const {data:worker,error:workerErr}=await db.from('david_worker_identities')
      .select('user_id,organization_id,active').eq('worker_id',link.worker_id).eq('active',true).maybeSingle();
    if(workerErr||!worker||worker.organization_id!==link.organization_id) {
      return response(res,403,{error:'worker_not_authorized'});
    }
    const {data:companies,error}=await db.from('david_companies')
      .select('id,company_name,country,country_code,sector,contact_email,contact_phone,task,research_notes,calling_approved,do_not_call,assigned_to')
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
  }catch{return response(res,503,{error:'assignments_unavailable'});}
}
