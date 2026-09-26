/* TUBAL HUB — GIF Sticker Picker
   Uses only real GIFs the user has uploaded in this browser.
   No fake/mock sticker data.
*/
(function(){
  const STORAGE_KEY='tubalhub-gif-stickers-v1';
  const MAX_STICKERS=24;
  const picker=document.getElementById('gifStickerPicker');
  const grid=document.getElementById('gifStickerGrid');
  const uploadBtn=document.getElementById('gifStickerUploadBtn');
  const closeBtn=document.getElementById('gifStickerClose');
  const gifBtn=document.getElementById('gifBtn');
  const gifInput=document.getElementById('gifInput');
  if(!picker||!grid||!uploadBtn||!closeBtn||!gifBtn||!gifInput)return;

  const read=()=>{
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      const list=raw?JSON.parse(raw):[];
      return Array.isArray(list)?list.filter(x=>x&&x.url):[];
    }catch(_){return [];}
  };
  const write=(list)=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(list.slice(0,MAX_STICKERS)));}catch(_){}
  };

  function close(){
    picker.hidden=true;
    picker.classList.remove('is-open');
  }
  function open(){
    render();
    picker.hidden=false;
    picker.classList.add('is-open');
  }
  function toggle(e){
    e?.preventDefault();
    e?.stopPropagation();
    picker.hidden ? open() : close();
  }

  function render(){
    const list=read();
    grid.replaceChildren();
    if(!list.length){
      const empty=document.createElement('div');
      empty.className='gif-sticker-empty';
      empty.innerHTML='<strong>No GIF stickers yet.</strong><span>Upload a GIF below and it will appear here for reuse.</span>';
      grid.appendChild(empty);
      return;
    }
    const frag=document.createDocumentFragment();
    list.forEach((item,index)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='gif-sticker-item';
      btn.title=item.name||'GIF Sticker';
      btn.setAttribute('aria-label','Send '+(item.name||'GIF Sticker'));
      const img=document.createElement('img');
      img.src=item.url;
      img.alt='';
      img.loading='lazy';
      img.decoding='async';
      btn.appendChild(img);
      btn.addEventListener('click',()=>{
        window.dispatchEvent(new CustomEvent('tubal-send-gif-sticker',{detail:{
          url:item.url,
          storagePath:item.storagePath||'',
          name:item.name||'GIF Sticker'
        }}));
        close();
      });
      frag.appendChild(btn);
    });
    grid.appendChild(frag);
  }

  function remember(item){
    if(!item?.url)return;
    const list=read().filter(x=>x.url!==item.url);
    list.unshift({
      url:String(item.url),
      storagePath:String(item.storagePath||''),
      name:String(item.name||'GIF Sticker'),
      savedAt:Date.now()
    });
    write(list);
  }

  gifBtn.title='GIF Stickers';
  gifBtn.setAttribute('aria-label','GIF Stickers');
  gifBtn.addEventListener('click',toggle);
  closeBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();});
  uploadBtn.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    gifInput.click();
  });

  document.addEventListener('click',e=>{
    if(!picker.hidden&&!picker.contains(e.target)&&e.target!==gifBtn)close();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!picker.hidden)close();
  });

  window.addEventListener('tubal-gif-uploaded',e=>{
    const detail=e.detail||{};
    if(detail.url)remember(detail);
    render();
  });

  window.addEventListener('tubal-gif-stickers-refresh',render);
  window.tubalGifStickerPicker={open,close,toggle,render,remember};
})();
