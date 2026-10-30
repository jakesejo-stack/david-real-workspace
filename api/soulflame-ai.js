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
  const models=['gemini-2.5-flash','gemini-2.5-flash-lite'];
  for(const model of models){
   const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
    body:JSON.stringify({systemInstruction:{parts:[{text:'You are SoulFlame AI, the DAVID DPP operator assistant. Reply in the same language as the operator. Provide concise, accurate help with Digital Product Passport and EU battery regulations. Never invent facts, companies, prices, or legal claims. Do not pretend to have made phone calls. Ask for clarification when necessary.'}]},contents:[{role:'user',parts:[{text:message.trim()}]}],generationConfig:{maxOutputTokens:900,temperature:0.4}}),
    signal:AbortSignal.timeout(25000)
   });
   const data=await response.json().catch(()=>({}));
   if(response.ok){
    const reply=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
    if(reply)return res.status(200).json({reply});
    return res.status(502).json({error:'Gemini did not return text. Try a different question.'});
   }
   const status=response.status;
   const googleStatus=String(data.error?.status||'');
   if(status===401||status===403||googleStatus==='API_KEY_INVALID')return res.status(502).json({error:'Gemini API key is invalid or does not have access. Generate a new key in Google AI Studio.'});
   if(status===429)return res.status(429).json({error:'Gemini API quota exceeded (429). Check usage and billing in Google AI Studio.'});
   if((status===404||status===400)&&model!==models[models.length-1])continue;
   if(status===404||status===400)return res.status(502).json({error:'Gemini model is unavailable for this API key. Check model access in Google AI Studio.'});
   return res.status(502).json({error:'Gemini request failed (Google HTTP '+status+'). Try again later.'});
  }
 }catch(error){return res.status(502).json({error:error?.name==='TimeoutError'?'Gemini request timed out. Try again.':'Cannot reach Gemini API. Try again later.'});}
}