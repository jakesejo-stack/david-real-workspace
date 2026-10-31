
/* DAVID Conference controls: real Twilio participant hold and approved warm transfer.
 * Disabled unless DAVID_CONFERENCE_CALLS_ENABLED=true; older dial calls remain untouched.
 * Do not perform transfers or provider recording without explicit operator action.
 */
import twilio from 'twilio';
import {approvedGoogleUser,serviceClient,response} from '../../api/_david_link_shared.js';
const base=()=>String(process.env.PUBLIC_ORIGIN||'').replace(/\/$/,'');
const endpoint=action=>base()+'/api/integrations/david/'+action;
const callSid=v=>/^CA[0-9a-f]{32}$/i.test(String(v||''));
const confSid=v=>/^CF[0-9a-f]{32}$/i.test(String(v||''));
const goodPhone=v=>/^\+[1-9]\d{7,14}$/.test(String(v||''));
const allowedNumbers=()=>String(process.env.DPP_TASK_ALLOWED_NUMBERS||'').split(',').map(x=>x.trim()).filter(goodPhone);
const conferenceEnabled=()=>process.env.DAVID_CONFERENCE_CALLS_ENABLED==='true';
const client=()=>twilio(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN);
function verifyWebhook(req,action){
 const signature=String(req.headers?.['x-twilio-signature']||'');
 return !!signature&&req.body?.AccountSid===process.env.TWILIO_ACCOUNT_SID&&
  twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN||'',signature,endpoint(action),req.body||{});
}
function conferenceTwiml(name,isOperator){
 const xml=new twilio.twiml.VoiceResponse();
 const dial=xml.dial({record:'do-not-record',...(isOperator?{action:endpoint('task-dial-finished'),method:'POST',timeLimit:300}:{})});
 dial.conference({
  startConferenceOnEnter:true,endConferenceOnExit:!!isOperator,beep:false,
  statusCallback:endpoint('task-conference-status'),
  statusCallbackEvent:['start','end','join','leave']
 },name);
 return xml.toString();
}
export async function createConferenceDial(db,parent,workerId,phone){
 if(!conferenceEnabled())throw Error('conference_mode_off');
 if(!callSid(parent)||!goodPhone(phone)||!allowedNumbers().includes(phone))throw Error('call_not_authorized');
 const friendly='david-'+parent;
 const {error:insertError}=await db.from('david_call_conferences').insert({
  parent_call_sid:parent,worker_user_id:workerId,friendly_name:friendly
 });
 if(insertError)throw Error('conference_state_failed');
 try{
  const result=await client().calls.create({
   from:process.env.TWILIO_FROM_NUMBER,to:phone,timeout:20,timeLimit:300,
   twiml:conferenceTwiml(friendly,false),
   statusCallback:endpoint('task-child-status'),statusCallbackMethod:'POST',
   statusCallbackEvent:['initiated','ringing','answered','completed']
  });
  if(!callSid(result.sid))throw Error('invalid_provider_call_sid');
  const {error}=await db.from('david_call_conferences').update({customer_sid:result.sid,updated_at:new Date().toISOString()}).eq('parent_call_sid',parent);
  if(error){try{await client().calls(result.sid).update({status:'completed'})}catch{};throw Error('conference_child_write_failed')}
  return conferenceTwiml(friendly,true);
 }catch(error){
  await db.from('david_live_call_sessions').update({state:'failed',ended_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('call_sid',parent);
  throw error;
 }
}
async function verified(req){
 const who=await approvedGoogleUser(req);
 if(!who)return {error:'google_login_required',status:401};
 const sid=String((req.method==='GET'?req.query:req.body)?.call_sid||'');
 if(!callSid(sid))return {error:'invalid_call_sid',status:400};
 const db=serviceClient();
 const [{data:s,error:se},{data:c,error:ce}]=await Promise.all([
  db.from('david_live_call_sessions').select('worker_user_id,state,ended_at').eq('call_sid',sid).eq('worker_user_id',who.user.id).maybeSingle(),
  db.from('david_call_conferences').select('*').eq('parent_call_sid',sid).eq('worker_user_id',who.user.id).maybeSingle()
 ]);
 if(se||ce)return {error:'conference_lookup_failed',status:503};
 if(!s)return {error:'call_not_owned',status:403};
 if(!c)return {error:'not_a_conference_call',status:409};
 if(s.ended_at||['completed','failed','canceled'].includes(s.state))return {error:'call_ended',status:409};
 return {db,conference:c};
}
export async function handleConferenceControl(req,res,action){
 if(req.method!==(action==='task-control-status'?'GET':'POST'))return response(res,405,{error:'method_not_allowed'});
 if(!conferenceEnabled())return response(res,409,{error:'conference_mode_not_activated'});
 const v=await verified(req);
 if(v.error)return response(res,v.status,{error:v.error});
 const {db,conference:c}=v;
 if(action==='task-control-status')return response(res,200,{available:true,hold:c.hold,transfer_status:c.transfer_status});
 if(!callSid(c.customer_sid))return response(res,409,{error:'customer_call_not_connected'});
 let conference;
 try{conference=(await client().conferences.list({friendlyName:c.friendly_name,status:'in-progress',limit:1}))[0]}
 catch{return response(res,502,{error:'twilio_conference_lookup_failed'})}
 if(!conference||!confSid(conference.sid))return response(res,409,{error:'conference_not_joined'});
 if(action==='task-hold'){
  const hold=req.body?.hold===true;
  try{await client().conferences(conference.sid).participants(c.customer_sid).update({hold})}
  catch{return response(res,502,{error:'twilio_hold_failed'})}
  const {error}=await db.from('david_call_conferences').update({hold,conference_sid:conference.sid,updated_at:new Date().toISOString()}).eq('parent_call_sid',c.parent_call_sid);
  return response(res,error?503:200,error?{error:'hold_audit_failed'}:{success:true,hold});
 }
 if(action!=='task-transfer')return response(res,404,{error:'not_found'});
 const destination=String(req.body?.destination||'').trim();
 const {data:attempt,error:ae}=await db.from('david_task_call_attempts').select('target_phone').eq('parent_call_sid',c.parent_call_sid).maybeSingle();
 if(!goodPhone(destination)||!allowedNumbers().includes(destination)||destination===attempt?.target_phone||
    destination===process.env.TWILIO_FROM_NUMBER||ae||!attempt)return response(res,403,{error:'transfer_target_not_approved'});
 if(c.transfer_sid)return response(res,409,{error:'transfer_once_per_call'});
 let created;
 try{
  created=await client().calls.create({
   to:destination,from:process.env.TWILIO_FROM_NUMBER,timeout:20,timeLimit:300,
   twiml:conferenceTwiml(c.friendly_name,false),
   statusCallback:endpoint('task-child-status'),statusCallbackMethod:'POST',
   statusCallbackEvent:['initiated','ringing','answered','completed']
  });
 }catch{return response(res,502,{error:'twilio_transfer_dial_failed'})}
 const {error:te}=await db.from('david_call_conferences').update({
  transfer_sid:created.sid,transfer_previous_sid:c.customer_sid,transfer_target:destination,
  transfer_status:'dialing',conference_sid:conference.sid,updated_at:new Date().toISOString()
 }).eq('parent_call_sid',c.parent_call_sid);
 if(te){
  try{await client().calls(created.sid).update({status:'completed'})}catch{}
  return response(res,503,{error:'transfer_audit_failed'});
 }
 return response(res,200,{success:true,transfer_status:'dialing'});
}
export async function handleConferenceWebhook(req,res,action){
 if(req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(!verifyWebhook(req,action))return response(res,403,{error:'invalid_twilio_signature'});
 const sid=String(req.body?.CallSid||'');
 if(!callSid(sid))return response(res,200,{ok:true});
 const db=serviceClient();
 if(action==='task-child-status'){
  const status=String(req.body?.CallStatus||'');
  if(['completed','busy','failed','no-answer','canceled'].includes(status)){
   await db.from('david_call_conferences').update({transfer_status:'failed',updated_at:new Date().toISOString()}).eq('transfer_sid',sid).eq('transfer_status','dialing');
  }
  return response(res,200,{ok:true});
 }
 if(String(req.body?.StatusCallbackEvent||'')!=='participant-join')return response(res,200,{ok:true});
 const {data:c}=await db.from('david_call_conferences').select('*').eq('transfer_sid',sid).eq('transfer_status','dialing').maybeSingle();
 if(!c||!callSid(c.transfer_previous_sid))return response(res,200,{ok:true});
 try{await client().calls(c.transfer_previous_sid).update({status:'completed'})}
 catch{return response(res,503,{error:'conference_transfer_finalize_failed'})}
 const {error}=await db.from('david_call_conferences').update({
  customer_sid:sid,hold:false,transfer_status:'connected',
  conference_sid:confSid(req.body?.ConferenceSid)?req.body.ConferenceSid:null,
  updated_at:new Date().toISOString()
 }).eq('parent_call_sid',c.parent_call_sid);
 return response(res,error?503:200,error?{error:'transfer_state_unavailable'}:{ok:true,transferred:true});
}
