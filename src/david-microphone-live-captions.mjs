// DAVID microphone captions: a browser-side preview, independent of Twilio.
// SpeechRecognition can use the browser vendor's recognition service.
// Local preview text is never submitted to DAVID, saved, or used as evidence
// of a customer's spoken words. Speaker monitoring is opt-in and ephemeral.
export function mountMicrophoneLiveCaptions({panel,language,onText=()=>{}}){
 const element=(tag,cls,text)=>{
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
 };
 const box=element('section','david-mic-preview');
 box.id='david-mic-preview';
 const header=element('div','david-mic-preview-head');
 const title=element('strong','','🎤 Моят микрофон · Живи надписи');
 const state=element('span','tag gray','○ Изчаква микрофон');
 state.setAttribute('role','status');
 header.append(title,state);
 const controls=element('div','david-mic-preview-controls');
 const mic=element('button','btn primary','🎤 Включи микрофона');
 const monitor=element('button','btn subtle','🎧 Чувам себе си');
 mic.type='button';monitor.type='button';monitor.disabled=true;
 controls.append(mic,monitor);
 const latest=element('div','david-mic-interim','Тук ще виждаш собствените си думи още докато ги изговаряш.');
 latest.setAttribute('aria-live','polite');
 const history=element('div','david-mic-history');
 history.setAttribute('role','log');history.setAttribute('aria-label','Моите завършени реплики');
 const explanation=element('p','tiny','Този прозорец разпознава само твоя микрофон, не гласа на клиента. Браузърът може да използва онлайн услуга за разпознаване. DAVID не записва тези думи в Call Records. За слушане на своя глас използвай слушалки, за да няма ехо.');
 const message=element('p','tiny','');
 box.append(header,controls,latest,history,explanation,message);
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 const canRecognize=typeof Speech==='function';
 let recognition=null,wanted=false,recognizing=false,stopping=false,disposed=false;
 let restartTimeout=null,restarts=0;
 let recent=[],interim='',latestText='';
 let audioStream=null,audioContext=null,audioSource=null,audioGain=null;
 const running=()=>wanted&&box.isConnected&&!disposed&&document.visibilityState==='visible';
 const setState=(label,color='gray')=>{state.textContent=label;state.className='tag '+color};
 const notify=(text)=>{message.textContent=text};
 const render=()=>{
  history.replaceChildren();
  for(const item of recent.slice(-8)){
   history.append(element('p','david-mic-final','Оператор: '+item));
  }
  latest.textContent=interim|| (wanted?'🎙️ Слушам. Говори нормално в микрофона...':'Включи микрофона, за да виждаш какво казваш.');
  latestText=interim||recent.at(-1)||'';
  onText(latestText);
 };
 function resetRecognizer(){
  if(restartTimeout){clearTimeout(restartTimeout);restartTimeout=null}
  if(recognition){
   recognition.onend=null;recognition.onerror=null;recognition.onresult=null;recognition.onstart=null;
   try{recognition.abort()}catch{}
   recognition=null;
  }
  recognizing=false;
 }
 async function stopMonitor(){
  monitor.textContent='🎧 Чувам себе си';
  if(audioSource){try{audioSource.disconnect()}catch{}audioSource=null}
  if(audioGain){try{audioGain.disconnect()}catch{}audioGain=null}
  if(audioStream){for(const track of audioStream.getTracks())track.stop();audioStream=null}
  if(audioContext){try{await audioContext.close()}catch{}audioContext=null}
 }
 function stopRecognition(manual=true){
  if(manual)wanted=false;
  if(restartTimeout){clearTimeout(restartTimeout);restartTimeout=null}
  if(recognition){try{recognition.abort()}catch{}recognition=null}
  recognizing=false;
  mic.textContent='🎤 Включи микрофона';
  if(manual){setState('○ Микрофонът е спрян');interim='';render()}
 }
 function beginRecognition(){
  if(!canRecognize){setState('⚠ Няма SpeechRecognition','red');notify('Този браузър не предоставя разпознаване на реч. Използвай актуален Microsoft Edge или Chrome.');return}
  if(!running()||recognizing)return;
  if(recognition){try{recognition.abort()}catch{}recognition=null}
  const r=new Speech();recognition=r;
  r.lang=language.value||'bg-BG';
  r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
  if('processLocally'in r)r.processLocally=false;
  r.onstart=()=>{
   if(!running())return;
   recognizing=true;restarts=0;
   setState('● Микрофонът слуша','green');
   mic.textContent='■ Спри микрофона';
   notify('Живата транскрипция на твоя глас е включена.');
  };
  r.onresult=event=>{
   if(!running()||recognition!==r)return;
   let partial='';
   for(let i=event.resultIndex;i<event.results.length;i++){
    const entry=event.results[i],sentence=String(entry?.[0]?.transcript||'').trim();
    if(!sentence)continue;
    if(entry.isFinal){recent.push(sentence);recent=recent.slice(-12)}
   }
   for(let i=0;i<event.results.length;i++){
    const entry=event.results[i];
    if(!entry.isFinal)partial+=String(entry?.[0]?.transcript||'');
   }
   interim=partial.trim();
   render();
  };
  r.onerror=event=>{
   if(recognition!==r)return;
   const code=String(event.error||'unknown');
   if(['not-allowed','service-not-allowed','audio-capture'].includes(code)){
    wanted=false;
    setState('⛔ Няма достъп до микрофона','red');
    notify('Браузърът не разрешава микрофона или услугата за разпознаване. Провери разрешението в адресната лента. Код: '+code);
    mic.textContent='🎤 Разреши микрофона';
   }else if(code==='language-not-supported'){
    wanted=false;setState('⚠ Няма модел за този език','red');
    notify('Този браузър не поддържа разпознаване на '+r.lang+'. Избери друг език или браузър.');
   }else if(code==='network'){
    setState('⚠ Услугата не отговаря','red');
    notify('Браузърната услуга за реч не отговаря. Това е отделно от Twilio. Избери опитай отново.');
    wanted=false;
   }else if(code!=='no-speech'&&code!=='aborted'){
    notify('Разпознаването съобщи: '+code);
   }
  };
  r.onend=()=>{
   if(recognition!==r)return;
   recognition=null;recognizing=false;
   if(running()&&restarts<4){
    restarts++;
    setState('◌ Продължавам да слушам');
    restartTimeout=setTimeout(()=>{restartTimeout=null;beginRecognition()},500);
   }else if(wanted&&restarts>=4){
    wanted=false;setState('⚠ Разпознаването спря','red');
    notify('Браузърът прекъсва разпознаването. Натисни Включи микрофона за нов опит.');
    mic.textContent='🎤 Опитай отново';
   }else if(!wanted){
    mic.textContent='🎤 Включи микрофона';
   }
  };
  try{
   r.start();
   mic.textContent='■ Спри микрофона';
   setState('◌ Включвам микрофона');
  }catch(error){
   recognition=null;recognizing=false;wanted=false;
   setState('⚠ Микрофонът не стартира','red');
   mic.textContent='🎤 Опитай отново';
   notify('Неуспешно стартиране: '+(error?.message||'провери разрешението на браузъра'));
  }
 }
 function startByUser(){
  if(!canRecognize){beginRecognition();return}
  if(wanted){stopRecognition(true);return}
  wanted=true;restarts=0;
  beginRecognition();
 }
 mic.addEventListener('click',startByUser);
 language.addEventListener('change',()=>{
  if(wanted){stopRecognition(false);interim='';beginRecognition()}
 });
 monitor.addEventListener('click',async()=>{
  if(audioStream){await stopMonitor();notify('Слушането на собствения глас е изключено.');return}
  if(!window.confirm('Включи слушалки, преди да чуваш собствения си микрофон, за да избегнеш силно ехо. Продължаваме ли?'))return;
  monitor.disabled=true;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Браузърът не разрешава аудио достъп.');
   audioStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(disposed||!panel.isConnected){await stopMonitor();return}
   const Context=window.AudioContext||window.webkitAudioContext;
   if(!Context)throw Error('Няма поддръжка за слушане през браузъра.');
   audioContext=new Context();
   audioSource=audioContext.createMediaStreamSource(audioStream);
   audioGain=audioContext.createGain();audioGain.gain.value=0.55;
   audioSource.connect(audioGain);audioGain.connect(audioContext.destination);
   await audioContext.resume();
   monitor.textContent='■ Спри слушането';
   notify('🎧 Чуваш микрофона си през избрания аудиоизход. Използвай слушалки, за да избегнеш обратна връзка.');
  }catch(error){await stopMonitor();notify('Не мога да включа слушането: '+(error?.message||'отказано разрешение'))}
  finally{if(!disposed)monitor.disabled=false}
 });
 const onVisibility=()=>{
  if(disposed)return;
  if(document.visibilityState!=='visible'){
   if(wanted){resetRecognizer();setState('○ На пауза (друг раздел)');mic.textContent='▶ Продължи микрофона'}
   void stopMonitor();
  }else if(wanted){restarts=0;beginRecognition()}
 };
 document.addEventListener('visibilitychange',onVisibility);
 function cleanup(){
  if(disposed)return;
  disposed=true;wanted=false;stopping=true;
  resetRecognizer();void stopMonitor();
  document.removeEventListener('visibilitychange',onVisibility);
  clearInterval(lifecycle);
 }
 const lifecycle=setInterval(()=>{if(!panel.isConnected)cleanup()},1200);
 if(!canRecognize){
  mic.disabled=true;setState('⚠ Не се поддържа','red');
  notify('Този браузър не предоставя Web Speech API. Не показваме измислена транскрипция.');
 }else if(navigator.permissions?.query){
  navigator.permissions.query({name:'microphone'}).then(permission=>{
   if(disposed)return;
   if(permission.state==='granted'){
    wanted=true;beginRecognition();
   }else if(permission.state==='denied'){
    mic.textContent='🎤 Разреши микрофона';
    setState('⛔ Микрофонът е блокиран','red');
    notify('Разреши микрофона от адресната лента. Без това не можем да слушаме твоя глас.');
   }else{
    setState('○ Нужно е разрешение');
    notify('Натисни „Включи микрофона“ и разреши достъпа. След това надписите ще започват автоматично при следващо отваряне.');
   }
  }).catch(()=>{notify('Натисни „Включи микрофона“, за да разрешиш достъп в браузъра.')});
 }else{
  notify('Натисни „Включи микрофона“ при първото използване.');
 }
 monitor.disabled=false;
 render();
 return {view:box,getText:()=>latestText,stop:cleanup};
}
