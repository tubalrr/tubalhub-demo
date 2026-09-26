/* TUBAL HUB — Notification Center */
import {app,auth} from "./firebase-config.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getFirestore,collection,query,where,limit,onSnapshot,doc,writeBatch} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db=getFirestore(app);

const DEMO_MODE=false;
const KEY="tubalhub.notifications.v1";
const LOCAL_SYSTEM_KEY="tubalhub.system-notifications.v1";
const esc=v=>{const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML};
const ICONS={like:"❤️",comment:"💬",follow:"👤",shop:"🛒",game:"🎮",achievement:"🏆",system:"⚙️"};
const ACTIONS={like:"reacted to your content",comment:"commented on your post",follow:"started following you",shop:"sent a shop update",game:"sent you a game invite",achievement:"unlocked an achievement",system:"sent a system update"};

const DEMO_SEED=[
  ["like","Your recent post received a reaction","A new reaction is waiting in your feed."],
  ["comment","Someone commented on your post","Open Feeds to read the latest comment."],
  ["follow","A community member followed you","Your community activity changed."],
  ["shop","A shop item was updated","Check the latest product information."],
  ["game","A game activity invite arrived","Open CTRLZONE to view the activity."],
  ["achievement","You reached a new milestone","Your activity earned a new achievement."],
  ["system","Your profile settings are ready","Review your account and privacy settings."],
  ["like","Your photo received a reaction","See the latest activity in your profile."],
  ["comment","A new reply is available","Continue the conversation in Feeds."],
  ["follow","A new follow activity is available","Visit Profiles for community activity."],
  ["shop","A product in your shop was updated","Review the updated listing."],
  ["game","New game activity is available","Check the latest CTRLZONE posts."],
  ["achievement","A profile milestone is available","Open your profile to see current badges."],
  ["system","Security settings reminder","Review sign-in and account settings."],
  ["like","Your content received another reaction","Open the feed for more details."],
  ["comment","New conversation activity","Someone interacted with your content."],
  ["shop","Shop activity is available","Open Shop for published products."],
  ["game","A new game update is available","Open CTRLZONE for current game content."],
  ["follow","New community activity is available","Open Profiles to view real members."],
  ["achievement","A new profile milestone is available","Check your profile activity."]
].map((x,i)=>({
  id:"demo-"+i,type:x[0],name:"TUBAL HUB",title:x[1],preview:x[2],
  time:Date.now()-i*60000*(i<8?10:90),online:i%3!==1,read:i>=17,buttons:x[0]==="game"
}));

let me=null,items=[],localSystemItems=[],activeTab="all",stopRemote=null,audioCtx=null;
function loadLocalSystem(){try{const x=JSON.parse(localStorage.getItem(LOCAL_SYSTEM_KEY)||"[]");localSystemItems=Array.isArray(x)?x:[]}catch(_){localSystemItems=[]}}
function saveLocalSystem(){try{localStorage.setItem(LOCAL_SYSTEM_KEY,JSON.stringify(localSystemItems.slice(0,50)))}catch(_){}}
export function addNotification(data={}){
  const id=String(data.id||("system-"+Date.now()+"-"+Math.random().toString(36).slice(2,8)));
  if(localSystemItems.some(x=>String(x.id)===id))return localSystemItems.find(x=>String(x.id)===id);
  const n={id:id,type:data.type||"system",name:"TUBAL HUB",title:data.title||"Website Updated!",preview:data.message||"",time:Date.now(),read:data.unread===true?false:true,url:"index.html",icon:data.icon||"🔔"};
  localSystemItems=[n,...localSystemItems].slice(0,50);
  saveLocalSystem();
  items=[...localSystemItems,...items.filter(x=>x.remote)];
  render();
  signalNew();
  return n;
}

function demoLoad(){
  try{const x=JSON.parse(localStorage.getItem(KEY)||"null");if(Array.isArray(x))return x}catch(_){}
  try{localStorage.setItem(KEY,JSON.stringify(DEMO_SEED))}catch(_){}
  return DEMO_SEED.slice();
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(items))}catch(_){}}
function ensureUi(){
  if(document.getElementById("thNotificationOverlay"))return;
  const tabs=["all","mentions","shop","games","system"].map(t=>'<button class="th-notification-tab '+(t==="all"?"active":"")+'" data-notification-tab="'+t+'" type="button">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>').join("");
  const note=DEMO_MODE?'<div class="th-notification-demo-note">Local preview data · live Firestore notifications appear automatically when available.</div>':"";
  document.body.insertAdjacentHTML("beforeend",
    '<div class="th-overlay th-notification-backdrop" id="thNotificationOverlay" hidden></div>'+
    '<aside class="th-notification-panel" id="thNotificationPanel" aria-hidden="true">'+
      '<div class="th-notification-shell" id="thNotificationShell">'+
        '<header class="th-notification-header">'+
          '<div class="th-notification-topline"><h2 class="th-notification-title">Notifications</h2>'+
            '<div class="th-notification-actions"><button class="th-notification-link" id="thMarkRead" type="button">Mark all read</button>'+
            '<button class="th-notification-gear" id="thNotificationSettings" type="button" aria-label="Notification settings">⚙</button>'+
            '<button class="th-notification-gear" id="thNotificationClose" type="button" aria-label="Close notifications">×</button></div></div>'+
          '<div class="th-notification-tabs" role="tablist" aria-label="Notification filters">'+tabs+'</div>'+
        '</header><div class="th-notification-scroll" id="thNotificationScroll"></div>'+
        '<div class="th-notification-footer"><button id="thViewAll" type="button">View all</button><button id="thClearAll" type="button">Clear all</button></div>'+
        note+
      '</div>'+
    '</aside>'
  );
  const overlay=document.getElementById("thNotificationOverlay");
  const panel=document.getElementById("thNotificationPanel");
  const shell=document.getElementById("thNotificationShell");
  const setOpen=open=>{
    if(open){
      overlay.hidden=false;overlay.style.display="block";overlay.style.pointerEvents="auto";panel.setAttribute("aria-hidden","false");
      requestAnimationFrame(()=>{overlay.classList.add("is-open");panel.classList.add("is-open")});
      document.body.classList.add("th-notification-open");
    }else{
      overlay.classList.remove("is-open");panel.classList.remove("is-open");panel.setAttribute("aria-hidden","true");
      setTimeout(()=>{if(!panel.classList.contains("is-open")){overlay.hidden=true;overlay.style.display="none";overlay.style.pointerEvents="none"}},240);
      document.body.classList.remove("th-notification-open");
    }
  };
  window.__tubalOpenNotifications=setOpen;
  document.querySelector(".notification-btn")?.addEventListener("click",()=>{setOpen(true);render()});
  document.getElementById("thNotificationClose").onclick=()=>setOpen(false);
  overlay.onclick=e=>{if(e.target===overlay)setOpen(false)};
  document.getElementById("thMarkRead").onclick=markAllRead;
  document.getElementById("thViewAll").onclick=()=>{activeTab="all";syncTabs();render()};
  document.getElementById("thClearAll").onclick=clearAll;
  document.getElementById("thNotificationSettings").onclick=()=>{window.location.href="pages/settings.html"};
  document.querySelectorAll("[data-notification-tab]").forEach(btn=>btn.addEventListener("click",()=>{activeTab=btn.dataset.notificationTab||"all";syncTabs();render()}));
  shell.addEventListener("pointermove",e=>{const r=shell.getBoundingClientRect();shell.style.setProperty("--mx",(e.clientX-r.left)+"px");shell.style.setProperty("--my",(e.clientY-r.top)+"px")},{passive:true});
}
function syncTabs(){document.querySelectorAll("[data-notification-tab]").forEach(b=>b.classList.toggle("active",b.dataset.notificationTab===activeTab))}
function unreadCount(){return items.filter(x=>!x.read).length}
function setBadge(){
  const count=unreadCount(),badge=document.querySelector(".notification-badge"),btn=document.querySelector(".notification-btn");
  if(badge){badge.textContent=count>99?"99+":String(count);badge.hidden=count===0}
  if(btn){btn.classList.toggle("has-new",count>0);btn.title=count?"Notifications ("+count+")":"Notifications"}
}
function group(ms){const age=Date.now()-Number(ms||0);return age<86400000?"Today":age<172800000?"Yesterday":"Earlier"}
function time(ms){const d=new Date(ms);return Number.isNaN(d.getTime())?"":d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}
function filtered(){return items.filter(n=>{
  if(activeTab==="all")return true;
  if(activeTab==="mentions")return n.type==="comment";
  if(activeTab==="shop")return n.type==="shop";
  if(activeTab==="games")return n.type==="game";
  if(activeTab==="system")return n.type==="system"||n.type==="achievement";
  return true;
}).sort((a,b)=>Number(b.time||0)-Number(a.time||0))}
function rowHtml(n,i){
  const avatar=n.photoURL?'<img src="'+esc(n.photoURL)+'" alt="">':esc((n.name||"TUBAL HUB").charAt(0).toUpperCase());
  const status=n.online===true?'<span class="th-notif-status online" title="Online"></span>':n.online===false?'<span class="th-notif-status offline" title="Offline"></span>':"";
  const icon=n.icon||ICONS[n.type]||"🔔";
  const url=n.url||({shop:"pages/shop.html",game:"pages/ctrlzone.html",comment:"pages/feeds.html",follow:"pages/profiles.html",like:"pages/feeds.html",achievement:"pages/profiles.html",system:"pages/settings.html"}[n.type]||"pages/feeds.html");
  return '<article class="th-notification-row '+(n.read?"is-read":"is-unread")+'" style="--stagger:'+Math.min(i,10)*.04+'s" data-notification-id="'+esc(n.id)+'">'+
    '<div class="th-notif-avatar-wrap"><div class="th-notif-avatar">'+avatar+'</div>'+status+'<span class="th-notif-type type-'+esc(n.type||"system")+'">'+icon+'</span></div>'+
    '<div class="th-notification-main"><div class="th-notification-copy"><strong>'+esc(n.name||"TUBAL HUB")+'</strong> <span class="th-notification-action">'+esc(ACTIONS[n.type]||"sent you an update")+'</span></div>'+
    '<div class="th-notification-time">'+esc(time(n.time))+'</div><span class="th-notification-preview">'+esc(n.title||"New activity")+'</span>'+
    (n.preview?'<span class="th-notification-preview">'+esc(n.preview)+'</span>':"")+
    (n.productImage?'<img class="th-notification-product-thumb" src="'+esc(n.productImage)+'" alt="">':"")+
    (n.buttons?'<div class="th-notification-action-bar"><button class="th-notification-action-btn" data-action="accept" data-id="'+esc(n.id)+'">Accept</button><button class="th-notification-action-btn" data-action="decline" data-id="'+esc(n.id)+'">Decline</button><button class="th-notification-view-btn" data-view="'+esc(url)+'">View</button></div>':"")+
    '</div><div class="th-notification-side">'+(!n.read?'<span class="th-notification-unread"></span>':"")+'<button class="th-notification-more" type="button" data-more="'+esc(n.id)+'" aria-label="Notification options">•••</button></div></article>';
}
function render(){
  ensureUi();setBadge();
  const box=document.getElementById("thNotificationScroll");if(!box)return;
  const data=filtered();
  if(!data.length){box.innerHTML='<div class="th-notification-empty"><div><div class="th-notification-empty-icon">🔔</div><strong>No notifications</strong><span>All caught up.</span></div></div>';return}
  let html="",last="";
  data.forEach((n,i)=>{const g=group(n.time);if(g!==last){last=g;html+='<div class="th-notification-group-label">'+g+'</div>'}html+=rowHtml(n,i)});
  box.innerHTML=html;
  box.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{const n=items.find(x=>String(x.id)===String(b.dataset.id));if(!n)return;n.read=true;n.actioned=b.dataset.action;save();b.classList.add("is-bounce");burst(b,6);setTimeout(()=>b.classList.remove("is-bounce"),450);render()});
  box.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{const id=b.closest("[data-notification-id]")?.dataset.notificationId,n=items.find(x=>String(x.id)===String(id));if(n){n.read=true;save()}window.location.href=b.dataset.view});
  box.querySelectorAll("[data-more]").forEach(b=>b.onclick=()=>{const n=items.find(x=>String(x.id)===String(b.dataset.more));if(n){n.read=true;save();render()}});
  box.querySelectorAll("[data-notification-id]").forEach(row=>row.onclick=e=>{if(e.target.closest("button"))return;const n=items.find(x=>String(x.id)===String(row.dataset.notificationId));if(n){n.read=true;save();row.classList.add("is-read");setBadge()}});
}
function burst(el,count){
  const r=el.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const dot=document.createElement("i");
    dot.style.cssText="position:fixed;left:"+(r.left+r.width/2)+"px;top:"+(r.top+r.height/2)+"px;width:5px;height:5px;border-radius:50%;background:#1dff91;pointer-events:none;z-index:10050";
    document.body.appendChild(dot);
    const dx=Math.random()*70-35,dy=Math.random()*70-35;
    dot.animate([{transform:"translate(-50%,-50%) scale(1)",opacity:1},{transform:"translate(calc(-50% + "+dx+"px),calc(-50% + "+dy+"px)) scale(.2)",opacity:0}],{duration:450,fill:"forwards",easing:"cubic-bezier(.34,1.56,.64,1)"}).onfinish=()=>dot.remove();
  }
}
async function markAllRead(){
  const rows=[...document.querySelectorAll(".th-notification-row.is-unread")];
  rows.forEach((row,i)=>row.animate([{transform:"translateX(0)",opacity:1},{transform:"translateX(34px)",opacity:0}],{duration:260,delay:i*12,fill:"forwards",easing:"cubic-bezier(.16,1,.3,1)"}));

  // Persist local/system notifications as read as well. Otherwise the
  // Firestore listener can re-add the old unread local items after render.
  localSystemItems=localSystemItems.map(n=>Object.assign({},n,{read:true}));
  saveLocalSystem();

  const unreadRemote=items.filter(x=>x.remote&&!x.read).slice(0,450);
  if(me&&unreadRemote.length){
    const batch=writeBatch(db);
    unreadRemote.forEach(n=>batch.update(doc(db,"notifications",n.id),{read:true}));
    try{await batch.commit()}
    catch(e){console.warn("[TUBAL HUB] mark notifications read",e)}
  }

  items=items.map(x=>Object.assign({},x,{read:true}));
  save();
  setBadge();
  setTimeout(render,270+Math.min(rows.length,10)*12);
}
async function clearAll(){
  if(DEMO_MODE){items=[];save();render();return}
  const batch=writeBatch(db);
  items.filter(x=>x.remote).slice(0,450).forEach(n=>batch.delete(doc(db,"notifications",n.id)));
  try{await batch.commit()}catch(e){console.warn("[TUBAL HUB] clear notifications",e);return}
  items=[];render();
}
function pop(){
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended")audioCtx.resume();
    const n=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.frequency.setValueAtTime(740,n);o.frequency.exponentialRampToValueAtTime(1080,n+.08);
    g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(.08,n+.015);g.gain.exponentialRampToValueAtTime(.0001,n+.18);
    o.connect(g);g.connect(audioCtx.destination);o.start(n);o.stop(n+.2);
  }catch(_){}
}
function notificationSoundEnabled(){try{return localStorage.getItem("tubalhub_notif_sound")==="1"}catch(_){return false}}
function signalNew(){const b=document.querySelector(".notification-btn");if(!b)return;b.classList.remove("has-new");void b.offsetWidth;b.classList.add("has-new");if(notificationSoundEnabled())pop();setBadge()}
function watchRemote(){
  if(stopRemote){stopRemote();stopRemote=null}
  if(!me)return;
  const q=query(collection(db,"notifications"),where("recipientUid","==",me.uid),limit(100));
  stopRemote=onSnapshot(q,snap=>{
    const remote=snap.docs.map(d=>{const x=d.data();return{
      id:d.id,remote:true,type:x.type||"system",name:x.actorName||"TUBAL HUB",photoURL:x.actorPhotoURL||"",online:x.actorOnline===true,
      read:x.read===true,title:x.title||"New activity",preview:x.preview||"",time:x.createdAt?.toMillis?.()||x.createdAt?.seconds*1000||Date.now(),url:x.url||"",productImage:x.productImage||""
    }});
    if(remote.length){items=[...localSystemItems,...remote];render()}else if(!items.length){items=DEMO_MODE?demoLoad():[...localSystemItems];render()}
  },err=>console.warn("[TUBAL HUB] notifications listener",err));
}
function demoTick(){
  if(!DEMO_MODE||!items.length||items.some(x=>x.remote))return;
  const src=DEMO_SEED[Math.floor(Math.random()*DEMO_SEED.length)];
  const n={id:"demo-live-"+Date.now(),type:src[0],name:"TUBAL HUB",title:src[1],preview:src[2],time:Date.now(),online:Math.random()>.4,read:false};
  items=[n].concat(items.filter(x=>!String(x.id).startsWith("demo-live-")).slice(0,39));save();render();signalNew();
}
ensureUi();
loadLocalSystem();
items=[...localSystemItems];
onAuthStateChanged(auth,user=>{
  me=user||null;
  watchRemote();
  render();
});
render();
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.getElementById("thNotificationPanel")?.classList.contains("is-open"))window.__tubalOpenNotifications?.(false)});
