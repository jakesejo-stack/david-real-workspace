import {authorizedBridge,serviceClient,jsonBody,validCode,validExternalId,codeDigest,response} from '../../_david_link_shared.js';
// DAVID backend only; protect the shared secret and the service-role key in Vercel server environment.
export default async function handler(req,res) {
  if(req.method!=='POST') return response(res,405,{error:'method_not_allowed'});
  try {
    if(!authorizedBridge(req)) return response(res,401,{error:'unauthorized'});
    const body=jsonBody(req);
    if(!validCode(body.code)||!validExternalId(body.external_user_id)) {
      return response(res,400,{error:'invalid_request'});
    }
    const {data,error}=await serviceClient().rpc('david_redeem_link_code',{
      p_code_hash:codeDigest(body.code),p_external_user_id:body.external_user_id
    });
    if(error) return response(res,503,{error:'verification_unavailable'});
    if(data?.ok!==true) return response(res,data?.reason==='rate_limited'?429:403,{error:data?.reason||'invalid_code'});
    return response(res,200,{
      worker_id:data.worker_id,organization_id:data.organization_id,role:data.role,
      active:data.active,external_user_id:data.external_user_id
    });
  }catch{return response(res,503,{error:'bridge_unavailable'});}
}
