// Temporary no-credential network diagnostic for DAVID. No user input or secrets are forwarded.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const targets=[
  ['gemini','https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite'],
  ['google','https://www.googleapis.com/discovery/v1/apis?name=generativelanguage']
 ];
 const results=await Promise.all(targets.map(async([name,url])=>{
  const started=Date.now();
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(3500),headers:{'Accept':'application/json'}});
   await r.body?.cancel().catch(()=>{});
   return {name,reachable:true,status:r.status,elapsedMs:Date.now()-started};
  }catch(e){return {name,reachable:false,errorType:e?.name||'Error',elapsedMs:Date.now()-started}}
 }));
 return res.status(200).json({checks:results});
}
