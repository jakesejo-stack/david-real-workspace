
import {approvedGoogleUser,newLinkCode,codeDigest,response} from '../../_david_link_shared.js';
export default async function handler(req,res){
 const action=req.query?.action;
 if(action==='create' && req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(action==='status' && req.method!=='GET')return response(res,405,{error:'method_not_allowed'});
 if(!['create','status'].includes(action))return response(res,404,{error:'not_found'});
 try{
  const ctx=await approvedGoogleUser(req);
  if(!ctx)return response(res,401,{error:'google_auth_required'});
  if(action==='create'){
   const code=newLinkCode();
   const {data,error}=await ctx.db.rpc('david_issue_link_code',{p_code_hash:codeDigest(code)});
   if(error)return response(res,error.code==='42501'?403:429,{error:'not_authorized_or_rate_limited'});
   return response(res,200,{worker_id:data.worker_id,organization_id:data.organization_id,role:data.role,
     code,expires_at:data.expires_at,david_url:'https://david-os-rust.vercel.app/work'});
  }
  const {data:identity,error}=await ctx.db.from('david_worker_identities')
    .select('worker_id,organization_id,active').eq('user_id',ctx.user.id).maybeSingle();
  if(error)return response(res,503,{error:'worker_lookup_unavailable'});
  if(!identity?.active)return response(res,403,{error:'not_approved'});
  const {data:member,error:memberError}=await ctx.db.from('david_members')
    .select('role').eq('user_id',ctx.user.id).maybeSingle();
  if(memberError||!['worker','admin'].includes(member?.role))return response(res,403,{error:'membership_revoked'});
  const {data:links,error:linkError}=await ctx.db.from('david_worker_links')
    .select('linked_at,last_verified_at,revoked_at,provider').eq('worker_id',identity.worker_id).is('revoked_at',null).limit(1);
  if(linkError)return response(res,503,{error:'link_lookup_unavailable'});
  return response(res,200,{worker_id:identity.worker_id,organization_id:identity.organization_id,
   active:true,david_linked:!!links?.length,integration_ready:!!(process.env.DAVID_LINK_CODE_PEPPER&&process.env.DAVID_BRIDGE_SHARED_SECRET&&process.env.SUPABASE_SERVICE_ROLE_KEY),linked_at:links?.[0]?.linked_at||null,
   david_url:'https://david-os-rust.vercel.app/work'});
 }catch{return response(res,503,{error:'link_service_unavailable'})}
}
