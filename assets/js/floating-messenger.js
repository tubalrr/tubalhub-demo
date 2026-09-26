import { app, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, addDoc, limit, doc, getDocsFromServer } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db=getFirestore(app);
let me=null,target=null,stopUsers=null,stopMessages=null,stopUnread=null,stopOwnPresence=null,lastSend=0,incomingReady=false,audioCtx=null;

const esc=v=>{const d=document.createElement("div");d.textContent=v??"";return d.innerHTML};
const initials=n=>(n||"Member").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"M";

function loadPremiumCss(){
  if(document.querySelector('link[data-tubal-floating-premium]'))return;
  const css=document.createElement("link");
  css.rel="stylesheet";css.dataset.tubalFloatingPremium="";
  css.href=new URL("/tubalhub/assets/css/floating-messenger-premium.css?v=20260924-msg2",window.location.origin).href;
  document.head.appendChild(css);
}
function setLauncherOnline(online){
  const b=document.getElementById("tubalMsgLauncher");if(!b)return;
  b.dataset.online=online?"true":"false";
  b.classList.toggle("online",online);b.classList.toggle("offline",!online);
}
function animateLauncher(){
  const b=document.getElementById("tubalMsgLauncher"),badge=document.getElementById("tubalMsgBadge");if(!b)return;
  b.classList.remove("msg-shake");void b.offsetWidth;b.classList.add("msg-shake");
  setTimeout(()=>b.classList.remove("msg-shake"),340);
  if(badge&&!badge.hidden){badge.classList.remove("is-bounce");void badge.offsetWidth;badge.classList.add("is-bounce");setTimeout(()=>badge.classList.remove("is-bounce"),470)}
}
function playMessageSound(){
  try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();const now=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.setValueAtTime(880,now);o.frequency.exponentialRampToValueAtTime(1320,now+.09);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.12,now+.015);g.gain.exponentialRampToValueAtTime(.0001,now+.22);o.connect(g);g.connect(audioCtx.destination);o.start(now);o.stop(now+.24)}catch(_){}
}
function ui(){
  if(document.getElementById("tubalMessenger"))return;
  const markup = [
    '<button id="tubalMsgLauncher" class="tubal-msg-launcher offline" data-online="false" aria-label="Messages">',
      '<svg class="tubal-msg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h4l4 3 4-3h4c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 10H4V6h16v8z"/></svg>',
      '<span id="tubalMsgStatus" class="tubal-msg-status" aria-hidden="true"></span>',
      '<span id="tubalMsgTooltip" class="tubal-msg-tooltip">Messages (0)</span>',
      '<span id="tubalMsgBadge" class="tubal-msg-badge" hidden>0</span>',
    '</button>',
    '<div id="tubalMsgBackdrop" class="tubal-msg-backdrop" hidden></div>',
    '<section id="tubalMessenger" class="tubal-msg-panel" hidden>',
      '<header class="tubal-msg-head"><strong>Messages</strong><span style="font-size:10px;color:#70ffe0">● Online</span><button id="tubalMsgClose" class="tubal-msg-close" type="button" aria-label="Close messages">×</button></header>',
      '<div id="tubalMsgList" class="tubal-msg-list"><div class="tubal-msg-loading">Loading members…</div></div>',
    '</section>',
    '<section id="tubalMsgWindow" class="tubal-msg-window" hidden>',
      '<header class="tubal-msg-window-head"><button type="button" id="tubalMsgProfile" class="tubal-msg-profile"><div id="tubalMsgAvatar" class="tubal-msg-avatar">M</div><div><strong id="tubalMsgName">Member</strong><div class="tubal-msg-status">● Online</div></div></button><button type="button" id="tubalMsgCall" title="Video call" aria-label="Video call">📹</button><button type="button" id="tubalMsgWindowClose" aria-label="Close private chat">×</button></header>',
      '<div id="tubalMsgBody" class="tubal-msg-body"></div>',
      '<form id="tubalMsgCompose" class="tubal-msg-compose"><input id="tubalMsgInput" maxlength="500" placeholder="Message…" autocomplete="off"><button type="submit" id="tubalMsgSend">Send</button></form>',
    '</section>'
  ].join("");
  document.body.insertAdjacentHTML("beforeend",markup);

  const launcher=document.getElementById("tubalMsgLauncher"),panel=document.getElementById("tubalMessenger"),backdrop=document.getElementById("tubalMsgBackdrop");
  const openDrawer=()=>{panel.hidden=false;backdrop.hidden=false;requestAnimationFrame(()=>panel.classList.add("msg-open"));launcher.classList.remove("is-pop");void launcher.offsetWidth;launcher.classList.add("is-pop");setTimeout(()=>launcher.classList.remove("is-pop"),470)};
  const closeDrawer=()=>{panel.classList.remove("msg-open");backdrop.hidden=true;setTimeout(()=>{if(!panel.classList.contains("msg-open"))panel.hidden=true},220)};
  launcher.onclick=e=>{e.preventDefault();panel.hidden?openDrawer():closeDrawer()};
  document.getElementById("tubalMsgClose").onclick=closeDrawer;
  backdrop.onclick=closeDrawer;

  panel.addEventListener("pointermove",e=>{const r=panel.getBoundingClientRect();panel.style.setProperty("--mx",e.clientX-r.left+"px");panel.style.setProperty("--my",e.clientY-r.top+"px")},{passive:true});
  window.addEventListener("tubalhubfloatingseen",()=>{if(typeof window.__tubalFloatingRender==="function")window.__tubalFloatingRender()});
  document.getElementById("tubalMsgWindowClose").onclick=()=>{target=null;if(stopMessages){stopMessages();stopMessages=null}document.getElementById("tubalMsgWindow").hidden=true};
  document.getElementById("tubalMsgProfile").onclick=e=>{e.preventDefault();e.stopPropagation();if(target)openUser(target)};
  document.getElementById("tubalMsgCall").onclick=e=>{e.preventDefault();e.stopPropagation();if(target)window.dispatchEvent(new CustomEvent("tubalhub-private-call",{detail:target}))};
  document.getElementById("tubalMsgCompose").onsubmit=async e=>{
    e.preventDefault();e.stopPropagation();
    const input=document.getElementById("tubalMsgInput"),text=input.value.trim();
    if(!text||!target||!me||Date.now()-lastSend<700)return;
    lastSend=Date.now();
    try{await addDoc(collection(db,"messages"),{uid:me.uid,senderId:me.uid,receiverId:target.uid,participants:[me.uid,target.uid],displayName:me.displayName||me.email?.split("@")[0]||"Member",senderPhotoURL:me.photoURL||"",text,type:"text",createdAt:new Date()});input.value="";input.focus()}
    catch(err){console.error("[TUBAL HUB] floating message",err);alert("Message was not sent. Check Firestore Rules.")}
  };
}
function markSeen(uid,ms){try{localStorage.setItem("tubalMsgSeen:"+uid,String(ms||Date.now()));localStorage.removeItem("tubalMsgUnread:"+uid)}catch(_){}updateBadge();window.dispatchEvent(new CustomEvent("tubalhubfloatingseen",{detail:{uid}}))}
function updateBadge(){
  const badge=document.getElementById("tubalMsgBadge"),tip=document.getElementById("tubalMsgTooltip"),launcher=document.getElementById("tubalMsgLauncher");
  if(!badge||!tip||!launcher)return 0;
  let total=0;
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith("tubalMsgUnread:"))total+=Number(localStorage.getItem(k)||0)}}catch(_){}
  badge.textContent=total>99?"99+":String(total);badge.hidden=total<1;tip.textContent="Messages ("+total+")";launcher.hidden=!me;return total;
}
function watchUnread(){
  if(stopUnread){stopUnread();stopUnread=null}
  if(!me)return;
  // The floating member/chat listener owns unread state now.
  incomingReady=true;
  updateBadge();
}

function messageMs(d){return d.createdAt?.toMillis?.()||d.createdAt?.seconds*1000||(d.createdAt instanceof Date?d.createdAt.getTime():0)||0}
function openIncomingChat(u){target=u;const w=document.getElementById("tubalMsgWindow");document.getElementById("tubalMsgName").textContent=u.displayName||"Member";document.getElementById("tubalMsgAvatar").innerHTML=u.photoURL?'<img src="'+esc(u.photoURL)+'" alt="">':esc(initials(u.displayName));w.hidden=false;document.getElementById("tubalMessenger").hidden=true;document.getElementById("tubalMsgBackdrop").hidden=true;subscribeMessages();document.getElementById("tubalMsgInput").focus()}
function openUser(u){
  if(!u||!u.uid||!me)return;
  target=u;
  markSeen(u.uid,Date.now());
  const w=document.getElementById("tubalMsgWindow");
  const name=document.getElementById("tubalMsgName");
  const avatar=document.getElementById("tubalMsgAvatar");
  const body=document.getElementById("tubalMsgBody");
  name.textContent=u.displayName||u.email?.split("@")[0]||"Member";
  avatar.innerHTML=u.photoURL?'<img src="'+esc(u.photoURL)+'" alt="">':esc(initials(u.displayName||u.email));
  body.innerHTML='<div class="tubal-msg-open-loading">Opening conversation…</div>';
  w.hidden=false;
  document.getElementById("tubalMessenger").hidden=true;
  document.getElementById("tubalMsgBackdrop").hidden=true;
  requestAnimationFrame(()=>document.getElementById("tubalMsgInput")?.focus());
  subscribeMessages();
}
function subscribeMessages(){
  if(stopMessages)stopMessages();
  if(!me||!target)return;
  const selectedUid=target.uid;
  const q=query(collection(db,"messages"),where("participants","array-contains",me.uid),limit(200));
  const paint=list=>{
    if(target?.uid!==selectedUid)return;
    list.sort((a,b)=>messageMs(a)-messageMs(b));
    const b=document.getElementById("tubalMsgBody");
    if(!b)return;
    b.innerHTML=list.length
      ?list.map(d=>'<div class="tubal-msg-bubble '+(d.senderId===me.uid?"me":"")+'">'+esc(d.text||"")+"</div>").join("")
      :'<div style="color:#8fa39a;text-align:center;padding:30px 10px;font-size:12px">No messages yet. Say hello! 👋</div>';
    b.scrollTop=b.scrollHeight;
    if(target)markSeen(target.uid,list.length?messageMs(list[list.length-1]):Date.now());
  };
  // Render the window immediately; hydrate with Firebase in the snapshot callback.
  const b=document.getElementById("tubalMsgBody");
  if(b)b.innerHTML='<div class="tubal-msg-open-loading">Loading conversation…</div>';
  stopMessages=onSnapshot(q,s=>{
    const list=[];
    s.forEach(x=>{
      const d=x.data();
      if(Array.isArray(d.participants)&&d.participants.includes(selectedUid))list.push(d);
    });
    paint(list);
  },e=>{
    const body=document.getElementById("tubalMsgBody");
    if(body&&target?.uid===selectedUid)body.innerHTML='<div class="tubal-msg-empty"><strong>Conversation unavailable.</strong><span>Private message access was denied or could not be loaded.</span></div>';
    console.error("[TUBAL HUB] message listener",e);
  });
}
function watchUsers(){
  if(stopUsers){stopUsers();stopUsers=null}
  if(!me)return;

  const usersRef=collection(db,"users");
  const presenceRef=collection(db,"presence");
  const messagesRef=collection(db,"messages");

  let usersMap=new Map(),presenceMap=new Map(),conversationMap=new Map();
  let usersLoaded=false,presenceLoaded=false,messagesLoaded=false;
  let stopUsersSnapshot=null,stopPresenceSnapshot=null,stopMessagesSnapshot=null;
  let refreshTimer=null,timeoutId=null;

  const onlineCutoff=()=>Date.now()-180000;
  const lastSeenMs=value=>{
    if(typeof value==="number")return value;
    return value?.toMillis?.()||value?.toDate?.()?.getTime?.()||0;
  };

  const render=()=>{
    const box=document.getElementById("tubalMsgList");
    if(!box)return;

    if(!usersLoaded&&!presenceLoaded&&!messagesLoaded){
      box.innerHTML='<div class="tubal-msg-loading">Loading members…</div>';
      return;
    }

    const rows=[...conversationMap.values()]
      .map(chat=>{
        const profile=usersMap.get(chat.uid)||{};
        const presence=presenceMap.get(chat.uid);
        const online=!!presence&&presence.online===true&&lastSeenMs(presence.lastSeen)>=onlineCutoff();
        const unread=Number(chat.unread||0);
        return {...chat,...profile,online,unread};
      })
      .sort((a,b)=>Number(b.unread>0)-Number(a.unread>0)||b.lastMs-a.lastMs);

    const onlineUsers=[...usersMap.values()]
      .filter(u=>u.uid&&u.uid!==me.uid)
      .map(u=>{
        const p=presenceMap.get(u.uid);
        const online=!!p&&p.online===true&&lastSeenMs(p.lastSeen)>=onlineCutoff();
        return {...u,online};
      })
      .filter(u=>u.online)
      .sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||"")));

    const list=rows.length?rows:onlineUsers.map(u=>({
      uid:u.uid,displayName:u.displayName,email:u.email,photoURL:u.photoURL,online:true,
      preview:"Online · Start a conversation",lastMs:0,unread:0
    }));

    if(!list.length){
      box.innerHTML='<div class="tubal-msg-empty"><strong>No conversations yet.</strong><span>When someone sends you a private message, they will appear here.</span></div>';
      return;
    }

    box.innerHTML=list.map(chat=>{
      const unread=Number(chat.unread||0);
      const preview=chat.preview||"Private conversation";
      const time=chat.lastMs?new Date(chat.lastMs).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"";
      return '<button type="button" class="tubal-msg-user '+(chat.online?"is-online ":"is-offline ")+(unread?"has-unread":"")+'" data-uid="'+esc(chat.uid)+'">'+
        '<div class="tubal-msg-avatar">'+(chat.photoURL?'<img src="'+esc(chat.photoURL)+'" alt="">':esc(initials(chat.displayName||chat.email||"Member")))+
        '<span class="tubal-msg-mini-status"></span></div>'+
        '<div class="tubal-msg-user-copy"><b>'+esc(chat.displayName||chat.email?.split("@")[0]||"Member")+'</b>'+
        '<span class="tubal-msg-preview">'+esc(preview)+'</span></div>'+
        '<div class="tubal-msg-row-meta">'+(time?'<time>'+esc(time)+'</time>':'')+(unread?'<strong class="tubal-msg-unread">'+(unread>99?"99+":unread)+'</strong>':'')+'</div></button>';
    }).join("");

    window.__tubalFloatingRender=render;

    if(!box.dataset.clickReady){
      const openRow=e=>{
        const button=e.target.closest?.(".tubal-msg-user");
        if(!button||!box.contains(button))return;
        e.preventDefault();e.stopPropagation();
        const uid=button.dataset.uid;
        const chat=window.__tubalFloatingChats?.get(uid);
        if(!chat)return;
        if(e.type==="click"&&button.dataset.pointerOpened==="1"){
          button.dataset.pointerOpened="0";
          return;
        }
        openUser(chat);
      };

      box.addEventListener("pointerdown",e=>{
        if(e.pointerType==="mouse"&&e.button!==0)return;
        const button=e.target.closest?.(".tubal-msg-user");
        if(!button)return;
        const uid=button.dataset.uid;
        const chat=window.__tubalFloatingChats?.get(uid);
        if(!chat)return;
        e.preventDefault();e.stopPropagation();
        button.dataset.pointerOpened="1";
        openUser(chat);
      },{passive:false});

      box.addEventListener("click",openRow);
      box.addEventListener("keydown",e=>{
        if(e.key!=="Enter"&&e.key!==" ")return;
        const button=e.target.closest?.(".tubal-msg-user");
        if(!button)return;
        const chat=window.__tubalFloatingChats?.get(button.dataset.uid);
        if(!chat)return;
        e.preventDefault();e.stopPropagation();openUser(chat);
      });

      box.dataset.clickReady="1";
    }

    window.__tubalFloatingChats=new Map(list.map(chat=>[String(chat.uid),chat]));
    box.querySelectorAll(".tubal-msg-user").forEach(button=>button.style.cursor="pointer");
  };

  const ingestUsers=snap=>{
    usersLoaded=true;usersMap=new Map();
    snap.forEach(d=>{
      const x=d.data();
      usersMap.set(x.uid||d.id,{...x,uid:x.uid||d.id});
    });
    render();
  };

  const ingestPresence=snap=>{
    presenceLoaded=true;presenceMap=new Map();
    snap.forEach(d=>{
      const x=d.data();
      presenceMap.set(x.uid||d.id,{...x,uid:x.uid||d.id});
    });
    render();
  };

  const ingestMessages=snap=>{
    messagesLoaded=true;
    conversationMap=new Map();

    snap.forEach(d=>{
      const x=d.data();
      const participants=Array.isArray(x.participants)?x.participants:[];
      if(!participants.includes(me.uid))return;

      const otherId=String(x.senderId||"")===String(me.uid)
        ? String(x.receiverId||participants.find(id=>String(id)!==String(me.uid))||"")
        : String(x.senderId||participants.find(id=>String(id)!==String(me.uid))||"");

      if(!otherId||otherId===String(me.uid))return;

      const ms=lastSeenMs(x.createdAt);
      const existing=conversationMap.get(otherId);
      const preview=x.type==="image"?"Sent an image":x.type==="gif"?"Sent a GIF":String(x.text||"").replace(/\s+/g," ").trim().slice(0,72);
      const unread=Number(localStorage.getItem("tubalMsgUnread:"+otherId)||0);

      if(!existing||ms>=existing.lastMs){
        conversationMap.set(otherId,{
          uid:otherId,
          displayName:String(x.senderId||"")===String(me.uid)?"":(x.displayName||""),
          photoURL:String(x.senderId||"")===String(me.uid)?"":(x.senderPhotoURL||x.photoURL||""),
          preview,lastMs:ms,unread
        });
      }
    });

    // Recompute unread counts from actual stored conversation messages.
    const unreadByUser={};
    snap.forEach(d=>{
      const x=d.data();
      if(String(x.receiverId||"")!==String(me.uid))return;
      const senderId=String(x.senderId||"");
      if(!senderId)return;
      const ms=lastSeenMs(x.createdAt);
      const seen=Number(localStorage.getItem("tubalMsgSeen:"+senderId)||0);
      if(ms>seen)unreadByUser[senderId]=(unreadByUser[senderId]||0)+1;
    });

    conversationMap.forEach((chat,uid)=>chat.unread=unreadByUser[uid]||0);
    Object.keys(unreadByUser).forEach(uid=>localStorage.setItem("tubalMsgUnread:"+uid,String(unreadByUser[uid])));
    render();
  };

  stopUsersSnapshot=onSnapshot(query(usersRef,limit(100)),ingestUsers,err=>{
    usersLoaded=true;console.error("[TUBAL HUB] floating users listener",err);
    render(err?.code==="permission-denied"?"Firestore denied member reads. Check Firestore Rules.":"Firebase users listener failed.");
  });

  stopPresenceSnapshot=onSnapshot(query(presenceRef,limit(100)),ingestPresence,err=>{
    presenceLoaded=true;console.error("[TUBAL HUB] floating presence listener",err);
    render(err?.code==="permission-denied"?"Firestore denied presence reads. Check Firestore Rules.":"Firebase presence listener failed.");
  });

  stopMessagesSnapshot=onSnapshot(query(messagesRef,where("participants","array-contains",me.uid),limit(200)),ingestMessages,err=>{
    messagesLoaded=true;console.error("[TUBAL HUB] floating messages listener",err);
    render(err?.code==="permission-denied"?"Firestore denied private message reads. Check Firestore Rules.":"Firebase private messages could not be loaded.");
  });

  timeoutId=setTimeout(()=>{
    if(!usersLoaded&&!presenceLoaded&&!messagesLoaded){
      render("Firebase is not responding. Check your connection or Firestore configuration.");
    }
  },3500);

  refreshTimer=setInterval(()=>{
    render();
  },30000);

  stopUsers=()=>{
    stopUsersSnapshot?.();
    stopPresenceSnapshot?.();
    stopMessagesSnapshot?.();
    clearInterval(refreshTimer);
    clearTimeout(timeoutId);
  };
}
function watchOwnPresence(){
  if(stopOwnPresence)stopOwnPresence();
  if(!me)return;
  setLauncherOnline(true);
  stopOwnPresence=onSnapshot(doc(db,"presence",me.uid),snap=>setLauncherOnline(snap.exists()?snap.data()?.online===true:true),()=>setLauncherOnline(true));
}
loadPremiumCss();ui();
onAuthStateChanged(auth,u=>{
  me=u&&!u.isAnonymous?u:null;
  const launcher=document.getElementById("tubalMsgLauncher");
  if(!me){
    setLauncherOnline(false);if(launcher)launcher.hidden=true;
    if(stopUsers)stopUsers();if(stopMessages)stopMessages();if(stopUnread)stopUnread();if(stopOwnPresence)stopOwnPresence();
    const backdrop=document.getElementById("tubalMsgBackdrop"),panel=document.getElementById("tubalMessenger");
    if(backdrop)backdrop.hidden=true;if(panel){panel.classList.remove("msg-open");panel.hidden=true}return;
  }
  if(launcher)launcher.hidden=false;setLauncherOnline(true);watchOwnPresence();watchUsers();updateBadge();
});