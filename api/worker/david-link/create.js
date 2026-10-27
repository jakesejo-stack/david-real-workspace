import {approvedGoogleUser,newLinkCode,codeDigest,response} from '../../_david_link_shared.js';
// Caller must possess a verified Google OAuth access token AND an approved DAVID membership.
export default async function handler(req,res) {
  if(req.method!=='POST') return response(res,405,{error:'method_not_allowed'});
  try {
    const ctx=await approvedGoogleUser(req);
    if(!ctx) return response(res,401,{error:'google_auth_required'});
    const code=newLinkCode();
    const {data,error}=await ctx.db.rpc('david_issue_link_code',{p_code_hash:codeDigest(code)});
    if(error) return response(res,error.code==='42501'?403:429,{error:'not_authorized_or_rate_limited'});
    return response(res,200,{
      worker_id:data.worker_id,organization_id:data.organization_id,role:data.role,
      code,expires_at:data.expires_at,
      david_url:'https://david-os-rust.vercel.app/work'
    });
  } catch {
    return response(res,503,{error:'link_service_unavailable'});
  }
}
