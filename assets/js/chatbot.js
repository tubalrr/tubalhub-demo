/* TUBAL HUB — LOCAL WEBSITE ASSISTANT
   Zero-cost mode: answers are generated from the built-in TUBAL HUB knowledge base.
   No Gemini/OpenAI API, API key, quota, or external AI request is required.
*/
(function(){
  const TUBAL_CHATBOT_SCRIPT_URL = document.currentScript?.src || new URL('assets/js/chatbot.js', document.baseURI).href;
  if(document.getElementById('tubalAiBot')) return;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../css/chatbot.css',TUBAL_CHATBOT_SCRIPT_URL).href;document.head.appendChild(css);
  const panel=document.createElement('div');panel.id='tubalAiBot';panel.className='tubal-bot-panel';panel.innerHTML=
    '<div class="tubal-bot-head"><div class="tubal-bot-avatar">🤖</div><div><div class="tubal-bot-title">TUBAL HUB AI</div><div class="tubal-bot-status">● Online assistant</div></div><button class="tubal-bot-close" aria-label="Close">×</button></div>'+
    '<div class="tubal-bot-messages" id="tubalBotMessages"></div>'+
    '<div class="tubal-bot-quick"><button data-q="What is TUBAL HUB?">What is TUBAL HUB?</button><button data-q="What is CTRLZONE?">CTRLZONE</button><button data-q="What is Payapang Isip?">Payapang Isip</button><button data-q="How do I register?">Register</button></div>'+
    '<form class="tubal-bot-form"><input id="tubalBotInput" autocomplete="off" placeholder="Ask TUBAL HUB AI..."><button aria-label="Send">➤</button></form>';
  const launch=document.createElement('button');launch.className='tubal-bot-launch';launch.id='tubalBotLaunch';launch.setAttribute('aria-label','Open TUBAL HUB AI');launch.textContent='🤖';
  document.body.append(panel,launch);
  const messages=panel.querySelector('#tubalBotMessages'),input=panel.querySelector('#tubalBotInput');
  /* ADMIN MODERATION ACCESS — visible only to the configured admin account. */
  let adminAuth=null,adminDb=null,adminUser=null;
  async function initAdminModeration(){
    if(location.pathname.indexOf('/admin/')===-1)return;
    try{
      const configUrl = new URL('./firebase-config.js', TUBAL_CHATBOT_SCRIPT_URL).href;
      const authMod=await import(configUrl);
      const authApi=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      const fs=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      adminAuth=authMod.auth;adminDb=fs.getFirestore(authMod.app);
      authApi.onAuthStateChanged(adminAuth,u=>{
        if(!u){ adminUser=null; removeAdminModeration(); return; }
        u.getIdTokenResult().then(tokenResult=>{
          adminUser=tokenResult?.claims?.admin===true ? u : null;
          if(adminUser) showAdminModeration(fs); else removeAdminModeration();
        }).catch(()=>{adminUser=null; removeAdminModeration();});
        if(adminUser) showAdminModeration(fs); else removeAdminModeration();
      });
    }catch(e){console.warn('[TUBAL HUB AI] admin moderation unavailable',e)}
  }
  function removeAdminModeration(){document.getElementById('tubalAdminModeration')?.remove()}
  function showAdminModeration(fs){
    if(document.getElementById('tubalAdminModeration'))return;
    const box=document.createElement('div');box.id='tubalAdminModeration';box.className='tubal-admin-mod';
    box.innerHTML='<div class="tubal-admin-title">🛡 Admin Moderation</div><select id="tubalBanMember"><option value="">Select member...</option></select><div class="tubal-admin-row"><select id="tubalBanDuration"><option value="1h">1 Hour</option><option value="6h">6 Hours</option><option value="12h">12 Hours</option><option value="1d">1 Day</option><option value="3d">3 Days</option><option value="7d">7 Days</option><option value="30d">30 Days</option><option value="permanent">Permanent</option></select><input id="tubalBanReason" placeholder="Reason (optional)"></div><button type="button" id="tubalBanBtn">🚫 Ban Member</button><button type="button" id="tubalUnbanBtn">♻️ Unban Selected</button><div id="tubalBanStatus" class="tubal-admin-status"></div>';
    panel.querySelector('.tubal-bot-quick').after(box);
    const select=box.querySelector('#tubalBanMember');
    fs.getDocs(fs.query(fs.collection(adminDb,'users'),fs.limit(200))).then(snap=>{
      snap.forEach(d=>{const x=d.data();if(d.id===adminUser.uid)return;const o=document.createElement('option');o.value=d.id;o.textContent=(x.displayName||x.email||'Member')+' — '+(x.chatStatus==='banned'?'BANNED':'ACTIVE');select.appendChild(o)});
    }).catch(e=>box.querySelector('#tubalBanStatus').textContent='Could not load members.');
    const status=box.querySelector('#tubalBanStatus');
    async function moderate(action){
      const uid=select.value;if(!uid){status.textContent='Select a member first.';return}
      const ref=fs.doc(adminDb,'users',uid);
      if(action==='unban'){
        await fs.updateDoc(ref,{chatStatus:'active',banned:false,banReason:null,bannedAt:null,bannedBy:null,banUntil:null});
        status.textContent='Member unbanned.';
        return;
      }
      const duration=box.querySelector('#tubalBanDuration').value,reason=box.querySelector('#tubalBanReason').value.trim()||'Global Chat rules violation';
      let banUntil=null;
      if(duration!=='permanent'){const hours={'1h':1,'6h':6,'12h':12,'1d':24,'3d':72,'7d':168,'30d':720};banUntil=fs.Timestamp.fromDate(new Date(Date.now()+hours[duration]*3600000));}
      await fs.updateDoc(ref,{chatStatus:'banned',banned:true,banReason:reason,bannedAt:fs.serverTimestamp(),bannedBy:adminUser.uid,banUntil});
      status.textContent=duration==='permanent'?'Member permanently banned.':'Member banned until '+banUntil.toDate().toLocaleString()+'.';
    }
    box.querySelector('#tubalBanBtn').onclick=async()=>{try{await moderate('ban')}catch(e){status.textContent='Ban failed: '+(e.code||e.message)}};
    box.querySelector('#tubalUnbanBtn').onclick=async()=>{try{await moderate('unban')}catch(e){status.textContent='Unban failed: '+(e.code||e.message)}};
  }

  const add=(text,type='bot')=>{const d=document.createElement('div');d.className='tubal-bot-msg '+type;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight;return d};
  add('👋 Welcome to TUBAL HUB! I’m your TUBAL HUB AI assistant. Welcome to the Hub — a place for content, community, creativity, gaming, stories, and more. How can I help you today?');
  /* ZERO-QUOTA WEBSITE KNOWLEDGE ENGINE */
  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
  const localAnswer=q=>{
    const s=normalize(q);
    const has=(...words)=>words.some(w=>s.includes(normalize(w)));

    if(has('hi','hello','hey','kumusta','kamusta','good morning','good afternoon','good evening'))
      return '👋 Hello! Ako ang TUBAL HUB website assistant. Pwede kitang tulungan hanapin ang platforms, pages at features ng TUBAL HUB.';

    if(has('what is tubal hub','ano ang tubal hub','tubal hub'))
      return 'TUBAL HUB ang main hub ng website para sa content, community, creativity, gaming at creator projects. Nandito ang CTRLZONE, Payapang Isip, AI Music, Global Chat, Community, Events, Shop, News, Profiles, About, Contact at Settings.';

    if(has('ctrlzone','gaming','games','laro'))
      return '🎮 CTRLZONE ang gaming platform ng TUBAL HUB. Para sa gaming content, game-related experiences at creator projects. Makikita mo ito sa left navigation.';

    if(has('payapang isip','payapang','nature','peace'))
      return '🌿 Payapang Isip ang nature at peaceful-mind platform ng TUBAL HUB. May forest/biophilic theme ito at nakatuon sa relaxing nature experience at community content.';

    if(has('global chat','chat','message','messages'))
      return '💬 Global Chat ang community chat area ng TUBAL HUB. Pumunta sa **Global Chat** sa left navigation para makapasok at makipag-chat sa community.';

    if(has('community','komunidad'))
      return '👥 Community ang section para sa TUBAL HUB community activities at shared content. Piliin ang **Community** sa left navigation.';

    if(has('event','events','activity'))
      return '📅 Events ang section para sa TUBAL HUB events at activities. Makikita ito sa left navigation.';

    if(has('shop','benta','products','mods','music media'))
      return '🛒 Shop ang marketplace-style section ng TUBAL HUB. May categories gaya ng Mods, Products, at Music & Media. Piliin ang **Shop** sa left navigation.';

    if(has('news','balita','latest news'))
      return '📰 News ang section para sa TUBAL HUB news at updates. Piliin ang **News** sa left navigation.';

    if(has('profile','profiles','account','my account'))
      return '👤 Profiles ang area para sa user profile. Kapag naka-login ka, puwede mong buksan ang profile at i-edit ang iyong profile information.';

    if(has('ai music','music','song','songs'))
      return '🎵 AI Music ang music-focused platform ng TUBAL HUB para sa creative music projects. Piliin ang **AI Music** sa left navigation.';

    if(has('settings','theme','appearance','galaxy','forest','neon'))
      return '⚙️ Settings ang page para sa website appearance at themes. May Auto Theme, Forest, Galaxy at Neon Green options.';

    if(has('about','tungkol'))
      return 'ℹ️ About ay para sa impormasyon tungkol sa TUBAL HUB. Makikita ito sa left navigation.';

    if(has('contact','kontak','message admin'))
      return '✉️ Contact ang page para sa contact information at pakikipag-ugnayan sa TUBAL HUB.';

    if(has('register','sign up','signup','mag register','gumawa ng account','account'))
      return '📝 Para gumawa ng account, gamitin ang **Sign Up** page. Pagkatapos mag-register at mag-login, available ang account-based features ng website.';

    if(has('login','log in','logout','logout'))
      return '🔐 Gamitin ang **Login** para makapasok sa iyong TUBAL HUB account. Kapag naka-login ka, makikita ang iyong account name sa top bar at available ang profile features.';

    if(has('where','saan','nasaan','location','hanapin','find'))
      return '🔎 Kung hinahanap mo ang isang platform, tingnan ang left navigation: CTRLZONE, News, Global Chat, Payapang Isip, Profiles, AI Music, Community, Events, Shop, About, Contact at Settings. Sabihin mo lang ang pangalan ng hinahanap mo.';

    if(has('platforms','platform','sections','pages','ano ano'))
      return '🌐 TUBAL HUB platforms/sections: Home, CTRLZONE, News, Global Chat, Payapang Isip, Profiles, AI Music, Community, Events, Shop, About, Contact at Settings.';

    return 'I can help with TUBAL HUB website information only. Subukan mong itanong: “Saan ang Global Chat?”, “Ano ang CTRLZONE?”, “Ano ang Payapang Isip?”, “Ano ang nasa Shop?”, o “Anong platforms meron sa TUBAL HUB?”';
  };

  async function ask(q){
    q=q.trim();if(!q)return;
    add(q,'user');input.value='';
    const thinking=add('Thinking…');
    setTimeout(()=>{
      thinking.remove();
      add(localAnswer(q));
    },180);
  }

  /* Fixed stacked launcher — intentionally not draggable. */
  launch.classList.remove('dragging');
  panel.querySelector('.tubal-bot-close').onclick=()=>panel.classList.remove('open');
  panel.querySelector('form').onsubmit=e=>{e.preventDefault();ask(input.value)};
  panel.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>ask(b.dataset.q));
  initAdminModeration();
})();
