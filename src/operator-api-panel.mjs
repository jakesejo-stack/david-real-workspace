// API settings UI for authenticated DAVID operators.
// The caller must enforce approved-user authorization and encrypted server-side persistence.
export function mountOperatorApiPanel(container,{getConnection,saveKey}={}) {
  const d=container.ownerDocument;
  const node=(tag,text)=>{const e=d.createElement(tag);if(text)e.textContent=text;return e};
  const section=node('section');section.className='card';
  section.append(node('h2','API · Моят Gemini'));
  section.append(node('p','1. Отвори Gemini, копирай личния си API ключ. 2. Върни се тук, постави го и натисни Запиши.'));
  const link=node('a','🔑 Генерирай Gemini API ключ');
  link.className='btn primary';link.style.display='inline-block';link.style.textDecoration='none';link.style.marginBottom='16px';
  link.href='https://aistudio.google.com/apikey';link.target='_blank';link.rel='noopener noreferrer';
  section.append(link);
  const label=node('label','Личен Gemini API ключ');label.htmlFor='david-operator-gemini-key';
  const field=node('input');field.id=label.htmlFor;field.type='password';field.autocomplete='off';
  field.spellcheck=false;field.placeholder='Постави ключа тук';field.className='field';
  const button=node('button','Запиши');button.type='button';button.className='btn primary';
  const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.fontWeight='700';status.style.marginTop='12px';
  const showStatus=(message,success=false)=>{status.textContent=message;status.style.color=success?'#167347':'#b42318';};
  const entry=node('div');entry.style.display='flex';entry.style.gap='10px';entry.style.alignItems='center';entry.style.flexWrap='wrap';
  field.style.flex='1 1 260px';field.style.width='auto';button.style.flex='0 0 auto';
  entry.append(field,button);section.append(label,entry);
  const syncInfo=node('p','🔗 Свързване с Google профила, с който си влязъл в DAVID. Натисни „Запиши“, за да синхронизираш ключа.');
  syncInfo.style.fontSize='13px';section.append(syncInfo,status);
  container.replaceChildren(section);
  // No localStorage, sessionStorage, plaintext DB writes, or key logging.
  if(typeof saveKey!=='function'){button.disabled=true;status.textContent='Защитеното запазване още не е свързано.';return;}
  let saving=false;
  button.addEventListener('click',async()=>{
    if(saving)return;
    const key=field.value.trim();
    if(!key){showStatus('✕ Полето е празно. Копирай целия ключ от Google AI Studio.');return;}
    if(!key.startsWith('AIza')&&!key.startsWith('AQ.')){showStatus('✕ Постави пълния Gemini ключ от AI Studio (формат AQ. или AIza).');return;}
    if(!/^(?:AIza[\w-]{20,}|AQ\.[A-Za-z0-9._-]{20,})$/.test(key)){showStatus('✕ Ключът изглежда непълен или съдържа допълнителни символи. Копирай целия API ключ от Google AI Studio.');return;}
    saving=true;button.disabled=true;status.style.color='#555';status.textContent='Запазване...';
    try{
      const result=await saveKey(key);
      if(result?.saved!==true)throw Error('Save not confirmed');
      field.value='';
      showStatus('✓ Готово! Gemini API ключът е запазен успешно и е свързан с този Google профил.',true);
    }catch{
      showStatus('✕ Ключът не е записан. Провери достъпа и опитай отново.');
    }finally{
      saving=false;button.disabled=false;
    }
  });
  if(typeof getConnection==='function')Promise.resolve().then(()=>getConnection()).then(s=>{
    // Do not overwrite a more recent save result with stale connection status.
    if(!saving&&!field.value&&status.textContent==='') {
      showStatus(s?.connected?'✓ Готово! Gemini е свързан с този Google профил.':'Gemini още не е свързан. Добави ключ и натисни „Запиши“.',!!s?.connected);
    }
  }).catch(()=>{
    if(!saving&&status.textContent==='')showStatus('Не може да се провери дали Gemini е свързан.');
  });
}
