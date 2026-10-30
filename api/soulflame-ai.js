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
  // Use a current text-only, low-latency model directly.
  // Do not list models for every message, which previously added seconds of latency.
  const model='gemini-3.5-flash-lite';
  const started=Date.now();
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
   body:JSON.stringify({
    systemInstruction:{parts:[{text:'You are DAVID, the SoulFlame DPP operator assistant. Reply in the user language. Be precise, brief, helpful, and never invent facts. Prefer 1-3 sentences.'}]},
    contents:[{role:'user',parts:[{text:message.trim()}]}],
    generationConfig:{maxOutputTokens:220,temperature:0.2,thinkingConfig:{thinkingLevel:'minimal'}}
   }),
   signal:AbortSignal.timeout(7000)
  });
  const result=await response.json().catch(()=>({}));
  res.setHeader('X-DAVID-AI-Model',model);
  res.setHeader('X-DAVID-AI-Elapsed-Ms',String(Date.now()-started));
  if(!response.ok){
   const details=String(result.error?.message||'Google did not accept the request').slice(0,200).replace(/[\r\n]/g,' ');
   return res.status(response.status===429?429:502).json({error:'Gemini HTTP '+response.status+': '+details});
  }
  const reply=(result.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  if(!reply)return res.status(502).json({error:'Gemini returned no text.'});
  return res.status(200).json({reply,model});
 }catch(error){return res.status(502).json({error:error?.name==='TimeoutError'?'Gemini did not respond within 7 seconds. Google latency is currently above our fast-chat target.':'Cannot reach Gemini API. Try again later.'});}
}