import {createHmac,timingSafeEqual} from 'node:crypto';
import {serviceClient,jsonBody,response} from '../../_david_link_shared.js';

// Signed server-to-server support ingress. No browser access, no client keys.
// Contract: HMAC-SHA256 over timestamp+"\n"+source_system+"\n"+external_org_id+"\n"
// +external_ticket_id+"\n"+title+"\n"+description+"\n"+category+"\n"+severity.
// Source-specific secrets and replay-resistant external_ticket_id are mandatory.
const fields=['source_system','external_org_id','external_ticket_id','title','description','category','severity'];
const secrets={
 dpp_autopilot:'DPP_AUTOPILOT_WEBHOOK_SECRET',
 soulflame_twins:'SOULFLAME_TWINS_WEBHOOK_SECRET'
};
export default async function handler(req,res){
 if(req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 try{
  const body=jsonBody(req);
  const system=body.source_system;
  if(!Object.hasOwn(secrets,system))return response(res,400,{error:'invalid_source'});
  if(fields.some(f=>typeof body[f]!=='string'))return response(res,400,{error:'invalid_payload'});
  if(fields.some(f=>body[f].length>6400))return response(res,400,{error:'payload_too_large'});
  const secret=process.env[secrets[system]];
  if(!secret||secret.length<32||!process.env.SUPABASE_SERVICE_ROLE_KEY){
   return response(res,503,{error:'integration_not_configured'});
  }
  const timestamp=String(req.headers['x-dpp-timestamp']||'');
  if(!/^\d{10}$/.test(timestamp)||Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300){
   return response(res,401,{error:'expired_or_missing_timestamp'});
  }
  const signature=String(req.headers['x-dpp-signature']||'').toLowerCase();
  if(!/^sha256=[a-f0-9]{64}$/.test(signature))return response(res,401,{error:'signature_required'});
  const canonical=[timestamp,...fields.map(k=>body[k])].join('\n');
  const expected=createHmac('sha256',secret).update(canonical).digest('hex');
  const supplied=signature.slice(7);
  if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(supplied,'hex'))){
   return response(res,401,{error:'signature_invalid'});
  }
  const {data,error}=await serviceClient().rpc('david_ingest_external_support_ticket',{
   p_source_system:body.source_system,
   p_external_org_id:body.external_org_id,
   p_external_ticket_id:body.external_ticket_id,
   p_title:body.title,p_description:body.description,
   p_category:body.category,p_severity:body.severity
  });
  if(error)return response(res,error.code==='42501'?403:400,{error:'mapping_or_validation_rejected'});
  return response(res,data?.created?201:200,{ok:true,ticket_id:data.ticket_id,created:data.created});
 }catch{return response(res,503,{error:'support_ingress_unavailable'});}
}
