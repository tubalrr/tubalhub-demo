/* TUBAL HUB — Real Chatbot */
(function(){
  "use strict";

  const JOURNAL_KEYS = ["tubalhub_journal","payapang-isip-journal-v1","payapang-journal"];
  const FEED_KEY = "tubalhub_feeds";
  const CART_KEY = "tubalhub_cart_real";
  const VERSION_KEY = "tubalhub_version_real";

  const $ = id => document.getElementById(id);

  function safeArray(keys){
    for(const key of keys){
      try{
        const raw=localStorage.getItem(key);
        if(!raw) continue;
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed)) return parsed;
      }catch(_){}
    }
    return [];
  }

  function getRealUserName(){
    const keys=["tubalhub_user_real","tubal_username","tubalhub_username_real","user_real","username"];
    for(const key of keys){
      try{
        const raw=localStorage.getItem(key);
        if(!raw || !String(raw).trim()) continue;
        try{
          const parsed=JSON.parse(raw);
          const value=parsed?.nameReal||parsed?.username||parsed?.displayName||parsed?.name||"";
          if(value && String(value).trim()) return String(value).trim();
        }catch(_){}
        return String(raw).trim();
      }catch(_){}
    }
    return null;
  }

  function displayName(name){
    const value=String(name||"").trim();
    if(!value) return "ikaw";
    return value.toLowerCase().includes("rr") ? "RR" : value;
  }

  function stats(){
    return {
      journals:safeArray(JOURNAL_KEYS).length,
      feeds:safeArray([FEED_KEY]).length,
      cart:safeArray([CART_KEY]).length,
      version:localStorage.getItem(VERSION_KEY)||"—"
    };
  }

  const knowledgeReal={
    siteReal:{
      nameReal:"TUBAL HUB",
      taglineReal:"Three Brands. One Hub.",
      brandsReal:[
        "TUBAL HUB — Community collection",
        "PAYAPANG ISIP — Calm collection",
        "CTRLZONE — Gaming collection"
      ],
      sectionsReal:[
        "Payapang Isip — journal saved in this browser",
        "Shop the Hub — collections and local cart data",
        "Community Feed — real posts saved in this browser",
        "Advertisement — repository-backed site data",
        "Featured Games — records from /data/games.json"
      ]
    },
    policiesReal:{
      cookiesReal:"TUBAL HUB uses browser storage for supported local features. The chatbot reads supported local data only to show current counts.",
      privacyReal:"Journal and browser-local entries are stored in this browser profile. The chatbot does not create fake entries or invent counts.",
      termsReal:"TUBAL HUB — Three Brands. One Hub. Community features should be used responsibly and users should not submit fake or misleading content.",
      dataReal:"Real-data rule: displayed journal, feed, cart, game, and version values come from browser storage or repository files. Missing data is shown as missing instead of being invented.",
      versionReal:"Homepage system updates are read from version.json using no-store requests."
    }
  };

  function escapeHtml(value){
    return String(value??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));
  }

  function addBotMessageReal(html){
    const messages=$("chatMessagesReal");
    if(!messages) return;
    const div=document.createElement("div");
    div.style.cssText="background:rgba(29,255,145,.12);border:1px solid rgba(29,255,145,.2);border-radius:18px 18px 4px 18px;padding:12px 14px;font-size:12px;line-height:1.5;max-width:85%;align-self:flex-start;";
    div.innerHTML='<b style="font-size:10px;opacity:.6;">TUBAL BOT • REAL</b><div style="margin-top:4px;color:#fff;">'+html+'</div>';
    messages.appendChild(div);
    messages.scrollTop=messages.scrollHeight;
  }

  function addUserMessageReal(value){
    const messages=$("chatMessagesReal");
    if(!messages) return;
    const div=document.createElement("div");
    div.style.cssText="background:linear-gradient(135deg,#1dff91,#7d5aff);border-radius:18px 18px 18px 4px;padding:12px 14px;font-size:12px;max-width:85%;align-self:flex-end;color:#020604;font-weight:600;";
    div.textContent=value;
    messages.appendChild(div);
    messages.scrollTop=messages.scrollHeight;
  }

  function welcomeUserReal(){
    const messages=$("chatMessagesReal");
    if(!messages || messages.children.length) return;
    const name=getRealUserName();
    const clean=displayName(name);
    const s=stats();

    if(name){
      addBotMessageReal(
        "Welcome "+escapeHtml(clean)+" sa TUBAL HUB! 🌿<br><br>"+
        "Real site data ngayon:<br>"+
        "• Payapang Isip — "+s.journals+" saved entries<br>"+
        "• Community Feed — "+s.feeds+" posts<br>"+
        "• Shop cart — "+s.cart+" items<br>"+
        "• Local detected version — "+escapeHtml(s.version)+"<br><br>"+
        "Tanong ka tungkol sa Payapang Isip, Shop, Feed, CTRLZONE, policies, o system updates."
      );
    }else{
      addBotMessageReal(
        "Welcome sa TUBAL HUB! 🌿<br><br>"+
        "Three Brands. One Hub.:<br>"+
        "• TUBAL HUB Community<br>"+
        "• PAYAPANG ISIP — A quiet place for your thoughts<br>"+
        "• CTRLZONE — Gaming collection<br><br>"+
        "Mag-login ka para ma-welcome kita gamit ang pangalan na naka-save sa browser."
      );
    }
  }

  function replyBotReal(question){
    const q=String(question||"").toLowerCase();
    const s=stats();
    const user=displayName(getRealUserName());

    if(q.includes("welcome")||q.includes("sino ako")||q.includes("login")){
      return "Ikaw ay "+escapeHtml(user)+". 🌿<br>Real data: "+s.journals+" journals, "+s.feeds+" posts, "+s.cart+" cart items sa browser.";
    }
    if(q.includes("cookie")){
      return "Cookies / browser storage: "+escapeHtml(knowledgeReal.policiesReal.cookiesReal);
    }
    if(q.includes("privacy")||q.includes("private")){
      return "Privacy: "+escapeHtml(knowledgeReal.policiesReal.privacyReal);
    }
    if(q.includes("terms")||q.includes("policy")||q.includes("rules")){
      return "Terms / community rules: "+escapeHtml(knowledgeReal.policiesReal.termsReal)+"<br><br>"+escapeHtml(knowledgeReal.policiesReal.dataReal);
    }
    if(q.includes("payapang")||q.includes("journal")){
      return "Payapang Isip — A quiet place for your thoughts 🌿<br>Real saved entries: <b>"+s.journals+"</b>.<br>Open: pages/payapang-isip.html";
    }
    if(q.includes("shop")||q.includes("cart")){
      return "TUBAL HUB SHOP 🛒<br>Real cart items: <b>"+s.cart+"</b>.<br>Open: pages/shop.html";
    }
    if(q.includes("game")||q.includes("ctrlzone")||q.includes("logo")){
      return "CTRLZONE 🎮<br>Featured Games are loaded from <b>/data/games.json</b>. The homepage uses the real logo field when the logo resource is available.<br>Open: pages/ctrlzone.html";
    }
    if(q.includes("feed")||q.includes("post")){
      return "Community Feed 📱<br>Real saved posts: <b>"+s.feeds+"</b>.<br>Open: pages/feeds.html";
    }
    if(q.includes("version")||q.includes("update")){
      return "System Update 🔔<br>Local detected version: <b>"+escapeHtml(s.version)+"</b>.<br>The homepage checks version.json with no-store requests for deployed changes.";
    }
    if(q.includes("real")||q.includes("fake")){
      return "REAL DATA rule: walang imbentong journal, post, cart count, game record, o random logo. Kapag walang data/file, ipinapakitang walang laman kaysa gumawa ng fake data.";
    }
    return "Gets ko: “"+escapeHtml(question)+"”<br><br>Maaari mong itanong tungkol sa Payapang Isip, Shop, Community Feed, CTRLZONE, cookies, privacy, terms, o version/update.";
  }

  function setStatus(){
    const status=$("chatbotStatusReal");
    if(!status) return;
    const name=getRealUserName();
    status.textContent=name ? "Welcome "+displayName(name)+" • Online" : "Online • Real site data";
  }

  function makeDraggableReal(){
    const root=$("tubalChatbotReal");
    const toggle=$("chatToggleReal");
    const win=$("chatWindowReal");
    if(!root || !toggle || !win) return;

    const POS_KEY="tubalhub_chatbot_position_real";
    let dragging=false;
    let moved=false;
    let startX=0;
    let startY=0;
    let startLeft=0;
    let startTop=0;
    let suppressClick=false;

    root.style.touchAction="none";
    root.style.userSelect="none";
    toggle.style.touchAction="none";
    toggle.style.cursor="grab";

    function clampPosition(left,top){
      const rect=root.getBoundingClientRect();
      const maxLeft=Math.max(6,window.innerWidth-rect.width-6);
      const maxTop=Math.max(6,window.innerHeight-rect.height-6);
      return {
        left:Math.min(Math.max(6,left),maxLeft),
        top:Math.min(Math.max(6,top),maxTop)
      };
    }

    function applyPosition(left,top,save=true){
      const p=clampPosition(left,top);
      root.style.left=p.left+"px";
      root.style.top=p.top+"px";
      root.style.right="auto";
      root.style.bottom="auto";
      if(save){
        try{localStorage.setItem(POS_KEY,JSON.stringify(p));}catch(_){}
      }
    }

    function restorePosition(){
      try{
        const raw=localStorage.getItem(POS_KEY);
        if(!raw) return;
        const p=JSON.parse(raw);
        if(Number.isFinite(p?.left) && Number.isFinite(p?.top)) applyPosition(p.left,p.top,false);
      }catch(_){}
    }

    function pointFor(event){
      return {x:event.clientX,y:event.clientY};
    }

    function startDrag(event){
      if(event.pointerType==="mouse" && event.button!==0) return;
      const target=event.target;
      if(target && target.closest && target.closest("input,textarea,button,a,select")){ return; }
      const rect=root.getBoundingClientRect();
      const p=pointFor(event);
      dragging=true;
      moved=false;
      startX=p.x;
      startY=p.y;
      startLeft=rect.left;
      startTop=rect.top;
      root.style.transition="none";
      if(toggle) toggle.style.cursor="grabbing";
      try{event.currentTarget.setPointerCapture(event.pointerId);}catch(_){}
    }

    function moveDrag(event){
      if(!dragging) return;
      const p=pointFor(event);
      const dx=p.x-startX;
      const dy=p.y-startY;
      if(Math.abs(dx)>5 || Math.abs(dy)>5) moved=true;
      if(!moved) return;
      applyPosition(startLeft+dx,startTop+dy,true);
      event.preventDefault();
    }

    function endDrag(event){
      if(!dragging) return;
      dragging=false;
      root.style.transition="";
      if(toggle) toggle.style.cursor="grab";
      if(moved) suppressClick=true;
      try{event.currentTarget.releasePointerCapture(event.pointerId);}catch(_){}
    }

    // Drag the floating bot or its header. Input/buttons stay clickable.
    [toggle,win].forEach(handle=>{
      handle.addEventListener("pointerdown",startDrag);
      handle.addEventListener("pointermove",moveDrag,{passive:false});
      handle.addEventListener("pointerup",endDrag);
      handle.addEventListener("pointercancel",endDrag);
    });

    toggle.addEventListener("click",event=>{
      if(suppressClick){
        suppressClick=false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },true);

    window.addEventListener("resize",()=>{
      const rect=root.getBoundingClientRect();
      if(!Number.isFinite(rect.left)||!Number.isFinite(rect.top)) return;
      applyPosition(rect.left,rect.top,true);
    });

    restorePosition();
  }

  function initReal(){
    const toggle=$("chatToggleReal");
    const win=$("chatWindowReal");
    const send=$("chatSendReal");
    const input=$("chatInputReal");
    if(!toggle||!win||!send||!input) return;

    setStatus();
    makeDraggableReal();

    toggle.addEventListener("click",()=>{
      const open=win.style.display==="flex";
      win.style.display=open?"none":"flex";
      toggle.setAttribute("aria-expanded",open?"false":"true");
      if(!open) welcomeUserReal();
    });

    const sendQuestion=()=>{
      const question=input.value.trim();
      if(!question) return;
      addUserMessageReal(question);
      input.value="";
      window.setTimeout(()=>addBotMessageReal(replyBotReal(question)),350);
    };

    send.addEventListener("click",sendQuestion);
    input.addEventListener("keydown",event=>{
      if(event.key==="Enter"){
        event.preventDefault();
        sendQuestion();
      }
    });

    window.addEventListener("storage",event=>{
      if(["tubalhub_user_real","tubal_username","tubalhub_username_real","tubalhub_journal","tubalhub_feeds","tubalhub_cart_real"].includes(event.key||"")){
        setStatus();
        const messages=$("chatMessagesReal");
        if(messages && messages.children.length===0 && win.style.display==="flex") welcomeUserReal();
      }
    });
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initReal,{once:true});
  else initReal();
})();