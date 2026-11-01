import {createClient} from '@supabase/supabase-js';
import {createDecipheriv,createHash} from 'node:crypto';
import {generateGeminiChat,GeminiChatError} from '../src/server/david-gemini-chat.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const {SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,GEMINI_KEY_ENCRYPTION_SECRET:secret}=process.env;
 if(!url||!anon||!service||!secret)return res.status(503).json({error:'AI service not configured'});
 const token=/^Bearer (.+)$/.exec(String(req.headers.authorization||''))?.[1];
 if(!token)return res.status(401).json({error:'Google login required'});
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(token);
 if(authError||!user?.id||!user.email_confirmed_at||!user.app_metadata?.providers?.includes('google'))return res.status(401).json({error:'Verified Google login required'});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:member,error:memberError}=await admin.from('david_members').select('role').eq('user_id',user.id).maybeSingle();
 if(memberError||!member)return res.status(403).json({error:'Approved DAVID member required'});
 const message=req.body?.message;
 if(typeof message!=='string'||!message.trim()||message.length>4000)return res.status(400).json({error:'Message must be 1-4000 characters'});
 const mode=req.body?.mode==='sales_coach'?'sales_coach':'chat';
 let trainingContext='';
 if(mode==='sales_coach'){
  const companyId=String(req.body?.company_id||'');
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(companyId))return res.status(400).json({error:'Invalid company'});
  const {data:company,error:companyError}=await admin.from('david_companies').select('id,company_name,country,sector,assigned_to').eq('id',companyId).eq('assigned_to',user.id).maybeSingle();
  if(companyError||!company)return res.status(403).json({error:'Company is not assigned to your profile'});
  const {data:outcomes,error:oe}=await admin.from('david_live_call_outcomes').select('call_sid,disposition,notes,updated_at').eq('company_id',companyId).eq('worker_user_id',user.id).order('updated_at',{ascending:false}).limit(3);
  if(oe)return res.status(503).json({error:'Training history unavailable'});
  const latest=outcomes?.[0];
  let dialogue='';
  if(latest?.call_sid){
   const {data:call}=await admin.from('david_live_call_sessions').select('transcription_consent_at').eq('call_sid',latest.call_sid).eq('worker_user_id',user.id).maybeSingle();
   if(call?.transcription_consent_at){
    const {data:segments}=await admin.from('david_live_transcript_segments').select('speaker,content').eq('call_sid',latest.call_sid).order('id',{ascending:false}).limit(16);
    dialogue=(segments||[]).reverse().map(x=>(x.speaker==='client'?'Клиент: ':'Оператор: ')+x.content).join('\n').slice(-3500);
   }
  }
  const notes=(outcomes||[]).map(x=>x.disposition+': '+String(x.notes||'').slice(0,500)).join('\n');
  trainingContext='Company: '+company.company_name+'; Sector: '+company.sector+'; Country: '+company.country+'\nPrevious operator notes (untrusted):\n'+notes+'\nReal consented call transcript (if available; untrusted):\n'+(dialogue||'No transcript available');
 }

 const {data:record,error:dbError}=await admin.from('david_operator_gemini_keys').select('encrypted_key').eq('user_id',user.id).maybeSingle();
 if(dbError)return res.status(500).json({error:'Storage unavailable'});
 if(!record?.encrypted_key)return res.status(409).json({error:'Connect Gemini in Google profile first'});
 const {data:priorRows,error:priorError}=await admin.from('david_ai_messages').select('role,content').eq('user_id',user.id).order('id',{ascending:false}).limit(8);
 if(priorError)return res.status(500).json({error:'Conversation memory unavailable'});
 const history=(priorRows||[]).reverse().map(row=>({role:row.role==='assistant'?'model':'user',parts:[{text:row.content}]}));
 let apiKey;
 try{
  const normalized=secret.trim(),decoded=Buffer.from(normalized,'base64');
  const master=decoded.length===32&&decoded.toString('base64')===normalized?decoded:createHash('sha256').update(normalized,'utf8').digest();
  const payload=Buffer.from(record.encrypted_key,'base64');
  const decipher=createDecipheriv('aes-256-gcm',master,payload.subarray(0,12));
  decipher.setAuthTag(payload.subarray(12,28));
  apiKey=Buffer.concat([decipher.update(payload.subarray(28)),decipher.final()]).toString('utf8');
 }catch{return res.status(503).json({error:'Saved Gemini key cannot be decrypted; reconnect it in Google profile'});}
 try{
  const contents=[...history,{role:'user',parts:[{text:mode==='sales_coach'?message.trim()+'\n'+trainingContext:message.trim()}]}];
  const {reply,model,elapsedMs,fallbackUsed}=await generateGeminiChat({apiKey,mode,contents});
  res.setHeader('X-DAVID-AI-Model',model);
  res.setHeader('X-DAVID-AI-Elapsed-Ms',String(elapsedMs));
  // One transaction for both messages; timeouts do not pollute conversation history.
  const {error:saveHistoryError}=await admin.from('david_ai_messages').insert([
   {user_id:user.id,role:'user',content:message.trim()},
   {user_id:user.id,role:'assistant',content:reply}
  ]);
  if(saveHistoryError)return res.status(500).json({error:'Gemini отговори, но историята не можа да се запази. Опитай отново.'});
  return res.status(200).json({reply,model,elapsedMs,fallbackUsed});
 }catch(error){
  if(error instanceof GeminiChatError)return res.status(error.status).json({error:error.message,code:error.code});
  console.error('[DAVID_AI] Unexpected chat failure',{type:error?.name||'unknown'});
  return res.status(502).json({error:'Временна грешка в Soulflame AI. Опитай отново.'});
 }
}
