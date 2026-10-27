import {approvedGoogleUser,jsonBody,response} from '../../_david_link_shared.js';
// Only an existing approved DB administrator can activate or revoke existing DAVID memberships.
export default async function handler(req,res) {
  if(req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
  try {
    const ctx=await approvedGoogleUser(req);
    if(!ctx)return response(res,401,{error:'google_auth_required'});
    const b=jsonBody(req);
    if(typeof b.user_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.user_id)||typeof b.active!=='boolean'){
      return response(res,400,{error:'invalid_request'});
    }
    const {data,error}=await ctx.db.rpc('david_admin_set_worker_active',{p_user_id:b.user_id,p_active:b.active});
    if(error)return response(res,error.code==='42501'?403:400,{error:'admin_approval_denied'});
    return response(res,200,data);
  }catch{return response(res,503,{error:'worker_administration_unavailable'});}
}
