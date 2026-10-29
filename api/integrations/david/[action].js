
import {authorizedBridge,serviceClient,jsonBody,validCode,validExternalId,codeDigest,response} from '../../_david_link_shared.js';

import twilio from 'twilio';
import {approvedGoogleUser} from '../../_david_link_shared.js';

const taskConfigKeys=['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_AUTH_TOKEN','TWILIO_TASK_TWIML_APP_SID','TWILIO_FROM_NUMBER','PUBLIC_ORIGIN','DPP_TASK_ALLOWED_NUMBERS'];
const taskReady=()=>process.env.LIVE_CALLS_ENABLED==='true'&&taskConfigKeys.every(k=>!!process.env[k]);
const dialDay=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return v.year+'-'+v.month+'-'+v.day;};
const bgNumber=s=>{const t=String(s||'').replace(/[ .()-]/g,'');return /^\+359\d{9}$/.test(t)?t:/^0\d{9}$/.test(t)?'+359'+t.slice(1):null;};
const getTaskNumber=task=>{const found=(String(task?.instructions||'')+' '+String(task?.title||'')).match(/\+359\d{9}|(?<!\d)0\d{9}(?!\d)/);return found?bgNumber(found[0]):null;};
const permittedNumber=n=>!!n&&(process.env.DPP_TASK_ALLOWED_NUMBERS||'').split(',').map(v=>bgNumber(v)).includes(n);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const callSidPattern=/^CA[0-9a-f]{32}$/i;
const callbackUrl=action=>String(process.env.PUBLIC_ORIGIN||'').replace(/\/$/,'')+'/api/integrations/david/'+action;
function signedTwilio(req,action){
  const signature=String(req.headers['x-twilio-signature']||'');
  const url=callbackUrl(action);
  if(!process.env.TWILIO_AUTH_TOKEN||!/^https:\/\//.test(url)||!signature)return false;
  const params=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN,signature,url,params);
}
function dialReject(res,message){
 const t=new twilio.twiml.VoiceResponse();
 t.say({language:'en-US'},message);
 t.hangup();
 res.setHeader('Content-Type','text/xml; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 return res.status(200).send(t.toString());
}
async function taskWorker(db,userId){
 const [identity,member,task]=await Promise.all([
  db.from('david_worker_identities').select('active').eq('user_id',userId).maybeSingle(),
  db.from('david_members').select('role').eq('user_id',userId).maybeSingle(),
  db.from('david_daily_worker_tasks').select('id,worker_user_id,task_date,title,instructions,target_calls').eq('worker_user_id',userId).eq('task_date',dialDay()).maybeSingle()
 ]);
 if(identity.error||member.error||task.error)throw Error('task_lookup_failed');
 if(identity.data?.active!==true||!['worker','admin'].includes(member.data?.role)||!task.data||task.data.target_calls<1)return null;
 return task.data;
}
async function handleTaskToken(req,res){
 if(req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(!taskReady())return response(res,503,{error:'twilio_task_configuration_incomplete',message:'Twilio calling is not configured/enabled'});
 try{
  const ctx=await approvedGoogleUser(req);
  if(!ctx)return response(res,401,{error:'google_login_required'});
  const task=await taskWorker(ctx.db,ctx.user.id);
  const phone=getTaskNumber(task);
  if(!task||!permittedNumber(phone))return response(res,403,{error:'no_approved_dial_target'});
  const db=serviceClient();
  const {data:used,error:usedError}=await db.from('david_task_call_attempts').select('id').eq('worker_user_id',ctx.user.id).eq('task_date',dialDay()).limit(1);
  if(usedError)return response(res,503,{error:'limit_check_unavailable'});
  if(used?.length)return response(res,409,{error:'daily_call_already_attempted'});
  const {AccessToken}=twilio.jwt;
  const token=new AccessToken(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_API_KEY_SID,process.env.TWILIO_API_KEY_SECRET,{
    identity:'dpp-task-'+ctx.user.id,ttl:600
  });
  token.addGrant(new AccessToken.VoiceGrant({outgoingApplicationSid:process.env.TWILIO_TASK_TWIML_APP_SID,incomingAllow:false}));
  return response(res,200,{token:token.toJwt(),dialTo:phone,taskId:task.id,remainingCalls:1});
 }catch{return response(res,503,{error:'task_token_unavailable'})}
}
async function handleTaskVoice(req,res){
 if(req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(!taskReady())return dialReject(res,'Calling is not configured.');
 if(!signedTwilio(req,'task-voice'))return response(res,403,{error:'twilio_signature_invalid'});
 try{
  const from=String(req.body?.From||'');
  const id=from.startsWith('client:dpp-task-')?from.slice('client:dpp-task-'.length):'';
  const sid=String(req.body?.CallSid||'');
  if(!uuidPattern.test(id)||!callSidPattern.test(sid))return dialReject(res,'Calling identity is invalid.');
  const db=serviceClient();
  const task=await taskWorker(db,id);
  const phone=getTaskNumber(task);
  if(!task||!permittedNumber(phone))return dialReject(res,'No approved daily calling task.');
  const {error}=await db.from('david_task_call_attempts').insert({
   worker_user_id:id,task_id:task.id,task_date:dialDay(),target_phone:phone,parent_call_sid:sid,status:'initiated'
  });
  if(error)return dialReject(res,'Daily calling limit or verification failed.');
  const twiml=new twilio.twiml.VoiceResponse();
  const dial=twiml.dial({callerId:process.env.TWILIO_FROM_NUMBER,timeout:20,answerOnBridge:true,record:'do-not-record'});
  dial.number(phone);
  res.setHeader('Content-Type','text/xml; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.status(200).send(twiml.toString());
 }catch{return dialReject(res,'Calling is not currently available.')}
}
async function handleTaskStatus(req,res){
 if(req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(!signedTwilio(req,'task-status'))return response(res,403,{error:'twilio_signature_invalid'});
 try{
  const sid=String(req.body?.CallSid||'');
  if(!callSidPattern.test(sid))return response(res,400,{error:'bad_call_sid'});
  const status=String(req.body?.CallStatus||'unknown');
  if(!['queued','initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled'].includes(status))return response(res,400,{error:'invalid_call_status'});
  const d=Number(req.body?.CallDuration);
  const patch={status,updated_at:new Date().toISOString()};
  if(Number.isInteger(d)&&d>=0&&d<=7200)patch.duration_seconds=d;
  const {error}=await serviceClient().from('david_task_call_attempts').update(patch).eq('parent_call_sid',sid);
  return response(res,error?503:200,error?{error:'status_unavailable'}:{ok:true});
 }catch{return response(res,503,{error:'status_unavailable'})}
}

export default async function handler(req,res){
 const action=req.query?.action;
 if(action==='tryout-voice'){
  if(!['GET','POST'].includes(req.method))return response(res,405,{error:'method_not_allowed'});
  const twiml=new twilio.twiml.VoiceResponse();
  const audio=String(process.env.DPP_BG_MALE_AUDIO_URL||'').trim();
  const validAudio=(()=>{
   try {const u=new URL(audio);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&/\.(mp3|wav|ogg)(?:$|\?)/i.test(u.pathname+u.search)} catch{return false}
  })();
  if(validAudio){twiml.play({loop:1},audio)}
  else {twiml.say({voice:'Google.bg-BG-Standard-B',language:'bg-BG',loop:1},
   'Това е тест на гласовата система Дейвид. Български мъжки глас все още не е настроен. Не се провежда разговор с клиент.')}
  twiml.hangup();
  res.setHeader('Content-Type','text/xml; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-DAVID-Voice-Sample',validAudio?'external-male-audio':'twilio-female-fallback');
  return res.status(200).send(twiml.toString());
 }
 if(action==='task-token')return handleTaskToken(req,res);
 if(action==='task-voice')return handleTaskVoice(req,res);
 if(action==='task-status')return handleTaskStatus(req,res);

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
