// API settings UI for authenticated DAVID operators.
// The caller must enforce approved-user authorization and encrypted server-side persistence.
export function mountOperatorApiPanel(container,{getConnection,saveKey}={}) {
  const d=container.ownerDocument;
  const node=(tag,text)=>{const e=d.createElement(tag);if(text)e.textContent=text;return e};
  const section=node('section');section.className='card';
  section.append(node('h2','API · Моят Gemini'));
  section.append(node('p','Създай личен Gemini API ключ, върни се в DAVID и го постави тук.'));
  const link=node('a','Отвори Google AI Studio · API keys');
  link.href='https://aistudio.google.com/apikey';link.target='_blank';link.rel='noopener noreferrer';
  section.append(link);
  const label=node('label','Личен Gemini API ключ');label.htmlFor='david-operator-gemini-key';
  const field=node('input');field.id=label.htmlFor;field.type='password';field.autocomplete='off';
  field.spellcheck=false;field.placeholder='Постави ключа тук';field.className='field';
  const button=node('button','Запази');button.type='button';button.className='btn primary';
  const status=node('p');status.setAttribute('role','status');
  section.append(label,field,button,status);
  container.replaceChildren(section);
  // No localStorage, sessionStorage, plaintext DB writes, or key logging.
  if(typeof saveKey!=='function'){button.disabled=true;status.textContent='Защитеното запазване още не е свързано.';return;}
  let saving=false;
  button.addEventListener('click',async()=>{
    if(saving)return;
    const key=field.value.trim();
    if(!/^AIza[\w-]{20,}$/.test(key)){status.textContent='Провери Gemini API ключа.';return;}
    saving=true;button.disabled=true;status.textContent='Запазване...';
    try{
      await saveKey(key);
      field.value='';
      status.textContent='Ключът е запазен към профила.';
    }catch{
      status.textContent='Запазването не успя. Опитай отново.';
    }finally{
      saving=false;button.disabled=false;
    }
  });
  if(typeof getConnection==='function')Promise.resolve().then(()=>getConnection()).then(s=>{
    // Do not overwrite a more recent save result with stale connection status.
    if(!saving&&!field.value&&status.textContent==='') {
      status.textContent=s?.connected?'Gemini е свързан с този профил.':'Gemini още не е свързан.';
    }
  }).catch(()=>{
    if(!saving&&status.textContent==='')status.textContent='Не може да се провери връзката.';
  });
}
