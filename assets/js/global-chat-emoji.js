/* =========================================================
   TUBAL HUB — FULL UNICODE EMOJI PICKER
   Runtime data source: Unicode Emoji latest dataset.
   ========================================================= */
(function(){
  // Keep the picker self-contained on GitHub Pages.
  // External Unicode datasets are intentionally not fetched at runtime,
  // so CORS/404 failures cannot spam the browser console.
  const DATA_URLS=[];
  const FALLBACK=[
    ['😀','grinning face'],['😃','grinning face with big eyes'],['😄','grinning face with smiling eyes'],['😁','beaming face with smiling eyes'],
    ['😆','grinning squinting face'],['😅','grinning face with sweat'],['😂','face with tears of joy'],['🤣','rolling on the floor laughing'],
    ['😊','smiling face with smiling eyes'],['😇','smiling face with halo'],['🥹','face holding back tears'],['🫠','melting face'],['🫥','dotted line face'],
    ['🫨','shaking face'],['🫩','face with bags under eyes'],['😍','smiling face with heart-eyes'],['🥰','smiling face with hearts'],
    ['😘','face blowing a kiss'],['😉','winking face'],['🙂','slightly smiling face'],['🙃','upside-down face'],['😭','loudly crying face'],
    ['😡','enraged face'],['🤔','thinking face'],['😎','smiling face with sunglasses'],['🥳','partying face'],['🤩','star-struck'],
    ['👍','thumbs up'],['👎','thumbs down'],['👏','clapping hands'],['🙌','raising hands'],['🙏','folded hands'],['🫶','heart hands'],
    ['🫱','rightwards hand'],['🫲','leftwards hand'],['🫷','leftwards pushing hand'],['🫸','rightwards pushing hand'],['👋','waving hand'],
    ['🤝','handshake'],['❤️','red heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart'],
    ['🐶','dog face'],['🐱','cat face'],['🐭','mouse face'],['🐹','hamster'],['🦊','fox'],['🐻','bear'],['🐼','panda'],
    ['🐨','koala'],['🐯','tiger'],['🦁','lion'],['🐮','cow'],['🐷','pig'],['🐸','frog'],['🐵','monkey face'],['🦄','unicorn'],
    ['🫎','moose'],['🫏','donkey'],['🪽','wing'],['🪿','goose'],['🐦‍🔥','phoenix'],['🐟','fish'],['🦋','butterfly'],
    ['🍎','red apple'],['🍋','lemon'],['🍋‍🟩','lime'],['🍄','mushroom'],['🍄‍🟫','brown mushroom'],['🫛','pea pod'],['🫚','ginger'],
    ['🫑','bell pepper'],['🫜','root vegetable'],['🍕','pizza'],['🍔','hamburger'],['🍟','french fries'],['🍜','steaming bowl'],
    ['⚽','soccer ball'],['🏀','basketball'],['🏆','trophy'],['🎮','video game'],['🎉','party popper'],['🛝','playground slide'],['🫧','bubbles'],
    ['🚗','automobile'],['✈️','airplane'],['🚀','rocket'],['🏠','house'],['🌎','globe showing Americas'],['☀️','sun'],['🌧️','cloud with rain'],
    ['💡','light bulb'],['📱','mobile phone'],['💻','laptop'],['🎧','headphone'],['📷','camera'],['🔋','battery'],['🪫','low battery'],
    ['🪭','folding hand fan'],['🪮','hair pick'],['🪇','maracas'],['🪈','flute'],['🪉','harp'],['🪏','shovel'],['🩼','crutch'],['🩻','x-ray'],
    ['🪾','leafless tree'],['🫟','splatter'],['⛓️‍💥','broken chain'],['🟰','heavy equals sign'],['✅','check mark button'],['❌','cross mark'],
    ['⚠️','warning'],['❗','exclamation mark'],['❓','question mark'],['⭐','star'],['🔥','fire'],['✨','sparkles'],['💯','hundred points']
  ];

  const GROUPS=[
    {key:'smileys-emotion',label:'Smileys & Emotion',icon:'😀'},
    {key:'people-body',label:'People & Body',icon:'🧑'},
    {key:'animals-nature',label:'Animals & Nature',icon:'🐻'},
    {key:'food-drink',label:'Food & Drink',icon:'🍔'},
    {key:'travel-places',label:'Travel & Places',icon:'✈️'},
    {key:'activities',label:'Activities',icon:'⚽'},
    {key:'objects',label:'Objects',icon:'💡'},
    {key:'symbols',label:'Symbols',icon:'🔣'},
    {key:'flags',label:'Flags',icon:'🏳️'}
  ];

  const STORAGE={
    recent:'tubalhub-emoji-recent-v2',
    frequent:'tubalhub-emoji-frequent-v2',
    tone:'tubalhub-emoji-tone-v2'
  };

  const esc=(v)=>{
    const d=document.createElement('div');
    d.textContent=String(v??'');
    return d.innerHTML;
  };
  const read=(key,fallback)=>{
    try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(_){return fallback}
  };
  const write=(key,value)=>{
    try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}
  };

  let items=[];
  let version='18.0';
  let variants=new Map();
  let emojiSet=new Set();
  let state={
    category:'latest',
    query:'',
    tone:Number(localStorage.getItem(STORAGE.tone)||0),
    longPressed:false
  };

  const picker=document.getElementById('emojiPicker');
  const grid=document.getElementById('emojiGrid');
  const tabs=document.getElementById('emojiTabs');
  const search=document.getElementById('emojiSearch');
  const sectionTitle=document.getElementById('emojiSectionTitle');
  const meta=document.getElementById('emojiPickerMeta');
  const toneButton=document.getElementById('emojiTone');
  const toneMenu=document.getElementById('emojiToneMenu');
  const variation=document.getElementById('emojiVariation');
  const variationLabel=document.getElementById('emojiVariationLabel');
  const variationGrid=document.getElementById('emojiVariationGrid');

  if(!picker||!grid||!tabs||!search)return;

  function groupKey(name){
    const hit=GROUPS.find(g=>g.label===name);
    return hit?.key||'symbols';
  }

  function parseData(text){
    const rows=[];
    let group='Symbols';
    let subgroup='';
    const dataVersion=(text.match(/^# Version:\s*([0-9.]+)/m)||[])[1]||'18.0';
    for(const line of String(text).split(/\r?\n/)){
      if(line.startsWith('# group: ')){group=line.slice(9).trim();continue}
      if(line.startsWith('# subgroup: ')){subgroup=line.slice(12).trim();continue}
      const m=line.match(/^([0-9A-F ]+)\s*;\s*fully-qualified\s+#\s+(\S+)\s+E([0-9.]+)\s+(.+)$/);
      if(!m)continue;
      rows.push({
        emoji:m[2],
        name:m[4].trim(),
        version:Number(m[3]),
        group:groupKey(group),
        groupLabel:group,
        subgroup,
        codepoints:m[1].trim()
      });
    }
    return {rows,version:dataVersion};
  }

  function parseFallback(){
    return {
      rows:FALLBACK.map(([emoji,name],i)=>({
        emoji,name,version:0,
        group:i<28?'smileys-emotion':i<44?'people-body':i<67?'animals-nature':i<82?'food-drink':i<90?'activities':i<110?'objects':'symbols',
        groupLabel:'Fallback',subgroup:'',codepoints:''
      })),
      version:'fallback'
    };
  }

  function buildVariants(){
    variants=new Map();
    for(const item of items){
      const toneMatch=item.name.match(/:\s*(light|medium-light|medium|medium-dark|dark) skin tone$/);
      const tone=toneMatch?({light:1,'medium-light':2,medium:3,'medium-dark':4,dark:5}[toneMatch[1]]):0;
      if(!tone)continue;
      const base=item.emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu,'');
      if(!variants.has(base))variants.set(base,[]);
      variants.get(base).push({...item,tone});
    }
    for(const [base,list] of variants){
      list.sort((a,b)=>(a.tone||99)-(b.tone||99));
      variants.set(base,list);
    }
  }

  function itemForEmoji(emoji){
    return items.find(x=>x.emoji===emoji)||null;
  }

  function preferredEmoji(item){
    const tone=Number(state.tone||0);
    if(!tone)return item.emoji;
    const list=variants.get(item.emoji)||[];
    return list.find(x=>x.tone===tone)?.emoji||item.emoji;
  }

  function saveSelection(emoji){
    const recent=read(STORAGE.recent,[]);
    write(STORAGE.recent,[emoji,...recent.filter(x=>x!==emoji)].slice(0,24));
    const frequent=read(STORAGE.frequent,{});
    frequent[emoji]=Number(frequent[emoji]||0)+1;
    write(STORAGE.frequent,frequent);
  }

  function recentItems(){
    return read(STORAGE.recent,[]).map(itemForEmoji).filter(Boolean);
  }

  function frequentItems(){
    const counts=read(STORAGE.frequent,{});
    return items.filter(x=>counts[x.emoji]>0)
      .sort((a,b)=>(counts[b.emoji]-counts[a.emoji])||(a.name.localeCompare(b.name)))
      .slice(0,96);
  }

  function latestItems(){
    return [...items]
      .sort((a,b)=>Number(b.version||0)-Number(a.version||0))
      .slice(0,100);
  }

  function currentItems(){
    const q=state.query.trim().toLowerCase();
    if(q)return items.filter(x=>(x.name+' '+x.subgroup+' '+x.groupLabel+' '+x.emoji).toLowerCase().includes(q));
    if(state.category==='latest')return latestItems();
    if(state.category==='recent')return recentItems();
    if(state.category==='frequent')return frequentItems();
    return items.filter(x=>x.group===state.category);
  }

  function makeButton(item,index){
    const button=document.createElement('button');
    button.type='button';
    button.className='emoji-btn';
    button.dataset.emoji=item.emoji;
    button.title=item.name;
    button.setAttribute('aria-label',item.name);
    const glyph=document.createElement('span');
    glyph.className='emoji-glyph';
    glyph.textContent=preferredEmoji(item);
    button.appendChild(glyph);

    let timer=null;
    button.addEventListener('pointerdown',()=>{
      state.longPressed=false;
      clearTimeout(timer);
      const list=variants.get(item.emoji)||[];
      if(list.length){
        timer=setTimeout(()=>{
          state.longPressed=true;
          showVariations(button,item,list);
        },520);
      }
    });
    const clear=()=>clearTimeout(timer);
    button.addEventListener('pointerup',clear);
    button.addEventListener('pointercancel',clear);
    button.addEventListener('mouseleave',clear);
    button.addEventListener('contextmenu',e=>e.preventDefault());
    button.addEventListener('click',e=>{
      if(state.longPressed){
        state.longPressed=false;
        e.preventDefault();
        return;
      }
      selectEmoji(preferredEmoji(item),button);
    });
    return button;
  }

  function render(){
    const list=currentItems();
    sectionTitle.textContent=state.query.trim()
      ? 'Search • '+list.length
      : (state.category==='latest'?'Latest 100':state.category==='recent'?'Recent':state.category==='frequent'?'Frequent':(GROUPS.find(g=>g.key===state.category)?.label||'Emoji'));
    grid.replaceChildren();
    if(!list.length){
      const empty=document.createElement('div');
      empty.className='emoji-empty';
      empty.textContent=state.category==='recent'?'No recent emoji yet.':'No emoji found.';
      grid.appendChild(empty);
      return;
    }
    const frag=document.createDocumentFragment();
    list.forEach((item,index)=>frag.appendChild(makeButton(item,index)));
    grid.appendChild(frag);
  }

  function setTab(key){
    state.category=key;
    state.query='';
    search.value='';
    tabs.querySelectorAll('.emoji-tab').forEach(b=>b.classList.toggle('active',b.dataset.category===key));
    render();
    grid.parentElement?.scrollTo({top:0,behavior:'smooth'});
  }

  function renderTabs(){
    tabs.replaceChildren();
    const top=[
      {key:'latest',icon:'✨',label:'Latest 100'},
      {key:'recent',icon:'🕘',label:'Recent'},
      {key:'frequent',icon:'⚡',label:'Frequent'},
      ...GROUPS
    ];
    top.forEach(x=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='emoji-tab';
      b.dataset.category=x.key;
      b.title=x.label;
      b.setAttribute('aria-label',x.label);
      b.textContent=x.icon;
      b.addEventListener('click',()=>setTab(x.key));
      tabs.appendChild(b);
    });
    tabs.querySelector('[data-category="'+CSS.escape(state.category)+'"]')?.classList.add('active');
  }

  function updateToneButton(){
    const tones=['🖐️','🏻','🏼','🏽','🏾','🏿'];
    toneButton.textContent=tones[state.tone]||tones[0];
    toneButton.setAttribute('aria-label','Skin tone '+(state.tone||'default'));
    toneMenu.querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.tone)===state.tone));
  }

  function renderToneMenu(){
    toneMenu.replaceChildren();
    const tones=['🖐️','🏻','🏼','🏽','🏾','🏿'];
    tones.forEach((emoji,tone)=>{
      const b=document.createElement('button');
      b.type='button';
      b.dataset.tone=String(tone);
      b.textContent=emoji;
      b.title=tone?'Skin tone '+tone:'Default skin tone';
      b.addEventListener('click',()=>{
        state.tone=tone;
        localStorage.setItem(STORAGE.tone,String(tone));
        updateToneButton();
        toneMenu.hidden=true;
        render();
      });
      toneMenu.appendChild(b);
    });
    updateToneButton();
  }

  function showVariations(button,item,list){
    variationLabel.textContent='Skin tones & variations';
    variationGrid.replaceChildren();
    const base=document.createElement('button');
    base.type='button';
    base.className='emoji-variation-btn';
    base.textContent=item.emoji;
    base.title='Default';
    base.addEventListener('click',()=>{selectEmoji(item.emoji,button);variation.hidden=true});
    variationGrid.appendChild(base);
    list.slice(0,8).forEach(v=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='emoji-variation-btn';
      b.textContent=v.emoji;
      b.title=v.name;
      b.addEventListener('click',()=>{selectEmoji(v.emoji,button);variation.hidden=true});
      variationGrid.appendChild(b);
    });
    const pr=picker.getBoundingClientRect();
    const br=button.getBoundingClientRect();
    variation.style.left=Math.max(6,Math.min(br.left-pr.left,pr.width-230))+'px';
    const desiredTop=Math.max(6,br.bottom-pr.top+4);
    const maxTop=Math.max(6,pr.height-96);
    variation.style.top=Math.min(desiredTop,maxTop)+'px';
    variation.hidden=false;
  }

  function burst(button){
    const wrap=document.createElement('span');
    wrap.className='emoji-particle-burst';
    for(let i=0;i<6;i++){
      const p=document.createElement('i');
      p.style.setProperty('--burst-angle',(i*60+((i%2)*8))+'deg');
      p.style.setProperty('--burst-delay',(i*.018)+'s');
      wrap.appendChild(p);
    }
    for(let i=0;i<3;i++){
      const trail=document.createElement('i');
      trail.className='emoji-trail';
      wrap.appendChild(trail);
    }
    button.appendChild(wrap);
    setTimeout(()=>wrap.remove(),680);
  }

  function selectEmoji(emoji,sourceButton){
    const input=document.getElementById('messageInput');
    if(!input)return;
    input.value+=(input.value?' ':'')+emoji;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
    saveSelection(emoji);
    if(sourceButton){
      sourceButton.classList.remove('is-pop');
      void sourceButton.offsetWidth;
      sourceButton.classList.add('is-pop');
      burst(sourceButton);
      setTimeout(()=>sourceButton.classList.remove('is-pop'),460);
    }
    toneMenu.hidden=true;
    variation.hidden=true;
  }

  function open(){
    picker.hidden=false;
    requestAnimationFrame(()=>{
      search.focus();
      renderTabs();
      render();
    });
  }
  function close(){
    picker.hidden=true;
    toneMenu.hidden=true;
    variation.hidden=true;
  }
  function toggle(){picker.hidden?open():close()}

  search.addEventListener('input',()=>{
    state.query=search.value;
    render();
    grid.parentElement?.scrollTo({top:0});
  });
  toneButton?.addEventListener('click',e=>{e.stopPropagation();toneMenu.hidden=!toneMenu.hidden;variation.hidden=true});
  document.addEventListener('click',e=>{
    if(!picker.hidden && !picker.contains(e.target) && e.target.id!=='emojiBtn')close();
    if(!toneMenu.hidden && !toneMenu.contains(e.target) && e.target!==toneButton)toneMenu.hidden=true;
    if(!variation.hidden && !variation.contains(e.target) && !e.target.closest('.emoji-btn'))variation.hidden=true;
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!picker.hidden)close()});
  document.getElementById('chatForm')?.addEventListener('submit',()=>close());

  async function load(){
    meta.textContent='Loading Unicode emoji…';
    for(const url of DATA_URLS){
      try{
        const response=await fetch(url,{cache:'force-cache'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const text=await response.text();
        const parsed=parseData(text);
        if(parsed.rows.length<500)throw new Error('Emoji dataset incomplete');
        items=parsed.rows;
        version=parsed.version;
        break;
      }catch(err){console.warn('[TUBAL HUB emoji picker]',url,err)}
    }
    if(!items.length){
      const parsed=parseFallback();
      items=parsed.rows;
      version=parsed.version;
      meta.textContent='Unicode data unavailable • fallback '+items.length;
    }else{
      meta.textContent='Unicode '+version+' • '+items.length.toLocaleString()+' emoji';
    }
    emojiSet=new Set(items.map(x=>x.emoji));
    buildVariants();
    renderTabs();
    render();
  }

  window.tubalEmojiPicker={open,close,toggle,select:selectEmoji};
  window.tubalEmojiSearch=()=>search.focus();

  function isEmojiCluster(segment){
    return /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u200D\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}]+$/u.test(segment);
  }

  window.tubalFormatChatText=function(text){
    const raw=String(text??'');
    const segs=[];
    try{
      const iterator=new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(raw);
      for(const part of iterator)segs.push(part.segment);
    }catch(_){
      for(const char of Array.from(raw))segs.push(char);
    }
    let emojiCount=0;
    let only=true;
    let emojiIndex=0;
    const html=segs.map(segment=>{
      if(/^\s+$/.test(segment)||segment==='')return esc(segment);
      const isEmoji=emojiSet.has(segment)||isEmojiCluster(segment);
      if(!isEmoji){
        only=false;
        return esc(segment);
      }
      const delay=(emojiIndex++*.05).toFixed(2);
      emojiCount++;
      return '<span class="chat-emoji" style="--emoji-delay:'+delay+'s">'+esc(segment)+'</span>';
    }).join('');
    return {
      html,
      className:only&&emojiCount?'chat-emoji-only '+(emojiCount===1?'emoji-single':'emoji-multi'):'',
      emojiCount
    };
  };

  load();
})();