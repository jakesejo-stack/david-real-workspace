import {authenticate,ensureAdmin,env,send,handlerError} from './_lib.js';
export default async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
 try{
  const me=await authenticate(req);ensureAdmin(me);
  const sid=String(req.query?.sid||'');if(!/^RE[a-f0-9]{32}$/i.test(sid))return send(res,400,{error:'Invalid recording SID'});
  const {data}=await me.s.from('david_recordings').select('recording_sid').eq('recording_sid',sid).maybeSingle();if(!data)return send(res,404,{error:'Not found'});
  if(env('ENABLE_RECORDING')!=='true')return send(res,409,{error:'Recording disabled'});
  const url=`https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_ACCOUNT_SID')}/Recordings/${sid}.mp3`;
  const auth=Buffer.from(env('TWILIO_ACCOUNT_SID')+':'+env('TWILIO_AUTH_TOKEN')).toString('base64');
  const r=await fetch(url,{headers:{Authorization:'Basic '+auth},redirect:'error'});
  if(!r.ok)return send(res,r.status===404?404:502,{error:'Recording not available'});
  const audioData=Buffer.from(await r.arrayBuffer());if(audioData.byteLength>25_000_000)return send(res,413,{error:'Recording too large to proxy'});
  res.setHeader('Content-Type','audio/mpeg');res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Disposition','attachment; filename="david-recording.mp3"');res.status(200).send(audioData);
 }catch(e){return handlerError(res,e)}
}
