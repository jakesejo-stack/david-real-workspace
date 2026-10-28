import twilio from 'twilio';
import {send,required,env,authenticate,workerIdentity,handlerError} from './_lib.js';
export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  try{
    if(env('LIVE_CALLS_ENABLED')!=='true')return send(res,503,{error:'Real calls are disabled by the administrator'});
    const me=await authenticate(req);
    const miss=required(['TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID']);
    if(miss.length)return send(res,503,{error:'Twilio configuration missing'});
    const AccessToken=twilio.jwt.AccessToken;
    const grant=new AccessToken.VoiceGrant({outgoingApplicationSid:process.env.TWILIO_TWIML_APP_SID,incomingAllow:false});
    const accessToken=new AccessToken(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_API_KEY_SID,process.env.TWILIO_API_KEY_SECRET,{identity:workerIdentity(me.user.id),ttl:3600});
    accessToken.addGrant(grant);
    return send(res,200,{token:accessToken.toJwt(),identity:workerIdentity(me.user.id)});
  }catch(e){return handlerError(res,e)}
}
