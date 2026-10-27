import {authorizedBridge,serviceClient,validExternalId,response} from '../../_david_link_shared.js';
// Recheck worker permissions on each privileged DAVID server request.
export default async function handler(req,res) {
  if(req.method!=='GET') return response(res,405,{error:'method_not_allowed'});
  try {
    if(!authorizedBridge(req)) return response(res,401,{error:'unauthorized'});
    const externalId=req.headers['x-david-external-user-id'];
    if(!validExternalId(externalId))return response(res,400,{error:'invalid_external_user_id'});
    const {data,error}=await serviceClient().rpc('david_verify_worker_link',{p_external_user_id:externalId});
    if(error) return response(res,503,{error:'verification_unavailable'});
    if(data?.active!==true) return response(res,403,{active:false});
    return response(res,200,data);
  }catch{return response(res,503,{error:'bridge_unavailable'});}
}
