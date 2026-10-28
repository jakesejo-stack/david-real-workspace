import {send,serviceClient,verifyTwilio,env} from './_lib.js';
export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
 if(!verifyTwilio(req,'recording'))return send(res,403,{error:'Invalid Twilio signature'});
 if(env('ENABLE_RECORDING')!=='true')return send(res,409,{error:'Recording disabled'});
 try{
  const sid=String(req.body?.RecordingSid||''),call=String(req.body?.CallSid||'');
  if(!/^RE[a-f0-9]{32}$/i.test(sid)||!/^CA[a-f0-9]{32}$/i.test(call))return send(res,400,{error:'Bad IDs'});
  const s=serviceClient();const {error}=await s.from('david_recordings').upsert({recording_sid:sid,call_sid:call,status:String(req.body?.RecordingStatus||'processing'),consent_basis:null});
  if(error)throw error;return send(res,200,{ok:true});
 }catch(e){return send(res,500,{error:'Recording metadata unavailable'});}
}
