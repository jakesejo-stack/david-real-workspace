// P2 worker profile card. Integrate by importing and calling mountDavidDppLinkCard
// after Google login in original Vite source. No codes in URL/localStorage.
export async function mountDavidDppLinkCard(container,supabase) {
  if(!container || !supabase)throw Error('Container and authenticated Supabase client required');
  const box=document.createElement('section');
  box.className='card david-link-card';
  const heading=document.createElement('h2');
  heading.textContent='Свързване с DAVID DPP';
  const status=document.createElement('p');
  status.className='muted';
  status.textContent='Проверка на служебния профил…';
  const worker=document.createElement('p');
  worker.className='tiny';
  const codeLabel=document.createElement('p');
  codeLabel.style.cssText='font-size:21px;font-weight:800;letter-spacing:2px';
  const actions=document.createElement('div');
  actions.className='row';
  const createBtn=document.createElement('button');
  createBtn.className='btn primary';
  createBtn.type='button';
  createBtn.textContent='Свържи с DAVID DPP';
  const copyBtn=document.createElement('button');
  copyBtn.className='btn';
  copyBtn.type='button';
  copyBtn.textContent='Копирай кода';
  copyBtn.disabled=true;
  const link=document.createElement('a');
  link.className='btn';
  link.href='https://david-os-rust.vercel.app/work';
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent='Отвори DAVID DPP';
  actions.append(createBtn,copyBtn,link);
  box.append(heading,status,worker,codeLabel,actions);
  container.append(box);
  let pendingCode=null;
  async function request(path,method='GET'){
    const {data,error}=await supabase.auth.getSession();
    if(error||!data?.session?.access_token)throw Error('Влез със служебния Google акаунт.');
    const res=await fetch(path,{method,headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'});
    const json=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(json.error||'Неуспешна проверка');
    return json;
  }
  try {
    const identity=await request('/api/worker/david-link/status');
    worker.textContent='Worker ID: '+identity.worker_id;
    status.textContent=identity.david_linked?'DAVID DPP: свързан':'Одобрен оператор · DAVID DPP не е свързан';
    createBtn.disabled=!!identity.david_linked;
  }catch(e){
    status.textContent=e.message;
    createBtn.disabled=true;
  }
  createBtn.addEventListener('click',async()=>{
    createBtn.disabled=true;
    codeLabel.textContent='';
    try{
      const info=await request('/api/worker/david-link/create','POST');
      pendingCode=info.code;
      codeLabel.textContent=info.code;
      status.textContent='Кодът е еднократен. Валиден до '+new Date(info.expires_at).toLocaleTimeString('bg-BG')+'.';
      copyBtn.disabled=false;
    }catch(e){status.textContent=e.message;createBtn.disabled=false;}
  });
  copyBtn.addEventListener('click',async()=>{
    if(!pendingCode)return;
    try{await navigator.clipboard.writeText(pendingCode);status.textContent='Кодът е копиран. Въведи го в DAVID DPP.';}
    catch{status.textContent='Не успях да копирам кода. Можеш да го маркираш ръчно.';}
  });
  return box;
}
