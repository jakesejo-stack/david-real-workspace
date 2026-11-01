import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateGeminiChat,GeminiChatError,CHAT_MODELS} from '../src/server/david-gemini-chat.mjs';

const contents=[{role:'user',parts:[{text:'Кой си ти?'}]}];
const good=message=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:message}]}}]})});
const bad=(status,message)=>({ok:false,status,json:async()=>({error:{message}})});

test('Soulflame AI returns genuine text from primary Gemini without backup',async()=>{
 let hits=0;
 const call=async (url,init)=>{
  hits++;
  assert.match(url,/gemini-3\.5-flash-lite:generateContent/);
  assert.equal(init.headers['x-goog-api-key'],'test-api-key');
  assert.equal(JSON.parse(init.body).generationConfig.thinkingConfig.thinkingLevel,'minimal');
  assert.equal(JSON.parse(init.body).generationConfig.maxOutputTokens,120);
  return good('Аз съм DAVID, AI асистентът на SoulFlame.');
 };
 const result=await generateGeminiChat({apiKey:'test-api-key',contents,fetchImpl:call});
 assert.equal(hits,1);
 assert.match(result.reply,/DAVID/);
 assert.equal(result.model,'gemini-3.5-flash-lite');
 assert.equal(result.fallbackUsed,false);
});
test('Transient primary timeout switches once to approved backup model',async()=>{
 const urls=[];
 const result=await generateGeminiChat({apiKey:'test-api-key',contents,fetchImpl:async url=>{
  urls.push(url);
  if(urls.length===1)throw Object.assign(new Error('abort'),{name:'TimeoutError'});
  return good('DAVID работи.');
 }});
 assert.equal(urls.length,2);
 assert.match(urls[1],/gemini-3\.1-flash-lite:generateContent/);
 assert.equal(result.fallbackUsed,true);
 assert.equal(result.reply,'DAVID работи.');
});
test('Gemini quota and key errors never trigger a secondary billable request',async()=>{
 for(const status of [429,403,400]){
  let calls=0;
  await assert.rejects(
   generateGeminiChat({apiKey:'test-api-key',contents,fetchImpl:async()=>{calls++;return bad(status,'test failure')}}),
   error=>error instanceof GeminiChatError&&error.code!=='timeout'
  );
  assert.equal(calls,1);
 }
});
test('Gemini content safety block is not bypassed with another model',async()=>{
 let count=0;
 await assert.rejects(generateGeminiChat({apiKey:'test-api-key',contents,fetchImpl:async()=>{count++;return {ok:true,status:200,json:async()=>({promptFeedback:{blockReason:'SAFETY'}})}}}),error=>error.code==='safety');
 assert.equal(count,1);
});
test('Two transient failures end as a visible error, never fabricated reply',async()=>{
 let count=0;
 await assert.rejects(generateGeminiChat({apiKey:'test-api-key',contents,fetchImpl:async()=>{count++;throw Object.assign(new Error('slow'),{name:'TimeoutError'})}}),error=>error.code==='timeout');
 assert.equal(count,2);
});
test('API stores history only after real reply, in one atomic insert',()=>{
 const api=readFileSync(new URL('../api/soulflame-ai.js',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../src/soulflame-ai-entry.mjs',import.meta.url),'utf8');
 assert.match(api,/generateGeminiChat\(\{apiKey,mode,contents\}\)/);
 assert.match(api,/\.insert\(\[\s*\{user_id:user\.id,role:'user',content:message\.trim\(\)\},\s*\{user_id:user\.id,role:'assistant',content:reply\}\s*\]\)/);
 assert.doesNotMatch(api,/AbortSignal\.timeout\(7000\)/);
 assert.match(frontend,/prompt\.value=message\+\(prompt\.value\?/);
 assert.match(frontend,/send\.textContent='DAVID обработва заявката\.\.\.'/);
 assert.deepEqual(CHAT_MODELS.map(m=>m.name),['gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
});

test('hedge starts backup before primary timeout, and cancels the unused request',async()=>{
 let startedPrimary=false,abortedPrimary=false,startedSecondary=false;
 const result=await generateGeminiChat({apiKey:'test-api-key',contents,hedgeAfterMs:5,fetchImpl:async(url,options)=>{
  if(url.includes('3.5')){
   startedPrimary=true;
   return new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>{abortedPrimary=true;reject(Object.assign(new Error('cancelled'),{name:'AbortError'}))},{once:true});
   });
  }
  startedSecondary=true;
  return good('Готово.');
 }});
 assert.equal(startedPrimary,true);
 assert.equal(startedSecondary,true);
 assert.equal(result.reply,'Готово.');
 assert.equal(abortedPrimary,true);
});
