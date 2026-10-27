import {approvedGoogleUser,response} from '../../_david_link_shared.js';
export default async function handler(req,res) {
  if(req.method!=='GET') return response(res,405,{error:'method_not_allowed'});
  try {
    const ctx=await approvedGoogleUser(req);
    if(!ctx)return response(res,401,{error:'google_auth_required'});
    const {data:identity,error}=await ctx.db.from('david_worker_identities')
      .select('worker_id,organization_id,active').eq('user_id',ctx.user.id).maybeSingle();
    if(error)return response(res,503,{error:'worker_lookup_unavailable'});
    if(!identity?.active)return response(res,403,{error:'not_approved'});
    const {data:member,error:memberError}=await ctx.db.from('david_members')
      .select('role').eq('user_id',ctx.user.id).maybeSingle();
    if(memberError||!['worker','admin'].includes(member?.role)) {
      return response(res,403,{error:'membership_revoked'});
    }
    const {data:links,error:linkError}=await ctx.db.from('david_worker_links')
      .select('linked_at,last_verified_at,revoked_at,provider')
      .eq('worker_id',identity.worker_id).is('revoked_at',null).limit(1);
    if(linkError)return response(res,503,{error:'link_lookup_unavailable'});
    return response(res,200,{worker_id:identity.worker_id,organization_id:identity.organization_id,
      active:true,david_linked:!!links?.length,
      linked_at:links?.[0]?.linked_at||null,
      david_url:'https://david-os-rust.vercel.app/work'});
  }catch{return response(res,503,{error:'link_status_unavailable'});}
}
