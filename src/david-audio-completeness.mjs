// Audio recording and playback helpers. Never invent missing seconds of a call.
import {fixWebmDuration} from '@fix-webm-duration/fix';

const supportedWebm=blob=>blob?.type?.split(';')[0]==='audio/webm'||blob?.type?.split(';')[0]==='video/webm';
const safeDuration=ms=>Number.isFinite(Number(ms))&&Number(ms)>0&&Number(ms)<=3600000?Math.round(Number(ms)):0;

export function formatAudioClock(milliseconds){
 const ms=safeDuration(milliseconds);
 const seconds=Math.floor(ms/1000);
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}

// Finalized MediaRecorder blobs can contain all samples but lack valid WebM duration
// metadata; fix only the header so seeking and the FULL clip length remain available.
export async function finalizeBrowserAudio(blob,elapsedMs){
 if(!(blob instanceof Blob)||blob.size<1024)throw Error('empty_recording');
 if(!supportedWebm(blob))return blob;
 const duration=safeDuration(elapsedMs);
 if(!duration)return blob;
 try{
  const fixed=await fixWebmDuration(blob,duration,{logger:false});
  return fixed?.size>=blob.size?fixed:blob;
 }catch(error){
  console.warn('DAVID audio header could not be normalized',error?.name||'unknown');
  return blob; // Never discard audio if the metadata repair fails.
 }
}

// For historical WebM files, decode the samples to determine their REAL duration.
// NEVER pass the call length to the metadata fixer: the old recording may be partial.
export async function preparePlaybackBlob(blob){
 if(!(blob instanceof Blob)||blob.size<1024||blob.size>26214400)throw Error('invalid_audio_blob');
 if(!supportedWebm(blob))return {blob,durationMs:null};
 const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Context)return {blob,durationMs:null};
 let context;
 try{
  context=new Context();
  const decoded=await context.decodeAudioData(await blob.arrayBuffer());
  const durationMs=safeDuration(decoded.duration*1000);
  const playable=durationMs?await finalizeBrowserAudio(blob,durationMs):blob;
  return {blob:playable,durationMs:durationMs||null};
 }catch(error){
  console.warn('DAVID audio duration could not be decoded',error?.name||'unknown');
  return {blob,durationMs:null};
 }finally{
  try{await context?.close()}catch{}
 }
}
