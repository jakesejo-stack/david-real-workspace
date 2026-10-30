import {createClient} from '@supabase/supabase-js';
import {createDecipheriv,createHash} from 'node:crypto';
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
 const {data:record,error:dbError}=await admin.from('david_operator_gemini_keys').select('encrypted_key').eq('user_id',user.id).maybeSingle();
 if(dbError)return res.status(500).json({error:'Storage unavailable'});
 if(!record?.encrypted_key)return res.status(409).json({error:'Connect Gemini in Google profile first'});
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
  const listing=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':apiKey},signal:AbortSignal.timeout(8000)});
  const listed=await listing.json().catch(()=>({}));
  if(!listing.ok)return res.status(502).json({error:'Gemini model discovery failed (Google HTTP '+listing.status+').'});
  const names=(listed.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name).filter(n=>/^models\/gemini-/.test(n)&&!/(tts|audio|speech|image|video|live|embedding|robotics|preview|experimental|exp-|computer-use)/i.test(n));
  const priority=['models/gemini-2.5-flash-lite','models/gemini-2.5-flash','models/gemini-2.0-flash'];
  const models=[...priority.filter(n=>names.includes(n)),...names.filter(n=>!priority.includes(n))].slice(0,4);
  if(!models.length)return res.status(502).json({error:'Google lists no compatible text models for this API key.'});
  const failures=[];
  for(const model of models){
   const response=await fetch('https://generativelanguage.googleapis.com/v1beta/'+model+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
    body:JSON.stringify({contents:[{role:'user',parts:[{text:message.trim()}]}],generationConfig:{maxOutputTokens:320,temperature:0.3}}),
    signal:AbortSignal.timeout(12000)
   });
   const data=await response.json().catch(()=>({}));
   if(response.ok){
    const reply=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
    if(reply)return res.status(200).json({reply});
    failures.push(model+': empty response');continue;
   }
   if(response.status===429)return res.status(429).json({error:'Gemini quota exceeded (429). Check Google AI Studio usage.'});
   failures.push(model+': HTTP '+response.status);
   if(response.status!==404&&response.status!==400)break;
  }
  return res.status(502).json({error:'Gemini text models failed: '+failures.join(', ').slice(0,240)});
 }catch(error){return res.status(502).json({error:error?.name==='TimeoutError'?'Gemini text generation timed out after 10 seconds. Check Google API response latency.':'Cannot reach Gemini API. Try again later.'});}
}