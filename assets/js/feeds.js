import {app,auth} from "./firebase-config.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getFirestore,collection,getDocs,getDoc,doc,addDoc,setDoc,updateDoc,deleteDoc,query,orderBy,limit,onSnapshot,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {getStorage,ref as storageRef,uploadBytes,getDownloadURL} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import {publishHubPost,subscribeHubPosts} from "./hub-content.js";

const db=getFirestore(app);
let storage=null;
const REACTIONS={
  like:{emoji:"👍",label:"Like"},love:{emoji:"❤️",label:"Love"},haha:{emoji:"😂",label:"Haha"},
  wow:{emoji:"😮",label:"Wow"},sad:{emoji:"😢",label:"Sad"},angry:{emoji:"😡",label:"Angry"}
};
const REACTION_KEYS=Object.keys(REACTIONS);
const QUICK_REACTIONS=REACTION_KEYS;
const state={
  auth:null,items:[],products:[],hubPosts:[],users:[],presence:new Map(),userMap:new Map(),
  reactions:readLocal("tubalhub-feed-reactions",{}),comments:readLocal("tubalhub-feed-comments",{}),
  commentReactions:readLocal("tubalhub-feed-comment-reactions",{}),shareCounts:readLocal("tubalhub-feed-shares",{}),
  saved:new Set(readLocal("tubalhub-feed-saved",[])),filter:"all",query:"",sort:"latest",
  page:0,pageSize:5,loading:false,savedMode:false,currentCommentId:null,commentLimit:6,
  replyingTo:null,editingCommentId:null,deleteCommentId:null,emojiOffset:0,emojiQuery:"",
  postFile:null,commentPhotoData:""
};
let stopHub=null,stopRemoteComments=null,stopRemoteReactions=null,uiReady=false;
let pickerTimer=null,pickerCloseTimer=null,pickerState={postId:null,targetType:"post",commentId:null,button:null,longPressTriggered:false};
let typingTimer=null;

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function readLocal(k,f){try{const v=JSON.parse(localStorage.getItem(k)||"null");return v??f}catch(_){return f}}
function writeLocal(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}}
function millis(v){return v?.toMillis?.()||v?.seconds*1000||(typeof v==="number"?v:0)}
function displayName(u){return u?.displayName||u?.name||u?.email?.split("@")[0]||"Member"}
function photoOf(u){return u?.photoURL||u?.avatarURL||u?.avatar||""}
function initials(n){return(String(n||"Member").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"M")}
function onlineOf(uid){return uid===state.auth?.uid||state.presence.get(uid)?.online===true}
function timeLabel(v){
  const t=millis(v),d=new Date(t||Date.now());if(Number.isNaN(d.getTime()))return "";
  const diff=Math.max(0,Date.now()-d.getTime()),m=Math.floor(diff/60000),h=Math.floor(m/60),days=Math.floor(h/24);
  if(m<1)return "Just now";if(m<60)return m+"m";if(h<24)return h+"h";if(days<7)return days+"d";
  return d.toLocaleDateString([],{month:"short",day:"numeric"});
}
function showNotice(message,success=false){
  const n=document.getElementById("feedNotice");if(!n)return;
  n.textContent=message;n.classList.toggle("success",success);n.classList.add("open");
  clearTimeout(showNotice.t);showNotice.t=setTimeout(()=>n.classList.remove("open"),2400);
}
function userRecord(uid){
  if(uid===state.auth?.uid)return state.auth;
  return state.userMap.get(uid)||state.presence.get(uid)||null;
}
function avatarMarkup(user,cls="comment-avatar"){
  const name=displayName(user),src=photoOf(user),online=onlineOf(user?.uid||"");
  return "<div class='"+esc(cls)+" with-status'>"+(src?"<img src='"+esc(src)+"' alt=''>":esc(initials(name)))+"<span class='avatar-status "+(online?"online":"")+"' aria-hidden='true'></span></div>";
}
function hubItem(x){
  const kind=x.contentType||"post";
  const type=kind==="product"?"product":kind==="game"?"game":kind==="video"?"video":kind==="audio"?"audio":"text";
  return {id:"hub-"+x.id,type,title:x.title||"",description:x.text||"",text:x.text||"",image:x.imageUrl||"",mediaUrl:x.mediaUrl||"",
    url:x.productUrl||"",productUrl:x.productUrl||"",price:x.price??"",stock:x.stock??"",author:x.authorName||"Member",
    photo:x.authorPhotoURL||"",uid:x.createdBy||"",createdAt:x.createdAt||0,likes:Number(x.likes||0),comments:Number(x.comments||0),
    shares:Number(x.shares||0),sponsored:x.sponsored===true,sourceCollection:x.sourceCollection||"",sourceId:x.sourceId||x.id,
    destinations:Array.isArray(x.destinations)?x.destinations:[],contentType:kind};
}
function contentKey(x){return x.sourceCollection&&x.sourceId?x.sourceCollection+":"+x.sourceId:x.type+":"+x.id}
const games=[
 ["Mobile Legends: Bang Bang","ML • MOBA","https://play.google.com/store/apps/details?id=com.mobile.legends","https://commons.wikimedia.org/wiki/Special:Redirect/file/Mobile_Legends_Logo.webp"],
 ["Honor of Kings","HOK • MOBA","https://www.honorofkings.com/","https://commons.wikimedia.org/wiki/Special:Redirect/file/Honor_of_Kings_Wordmark_Logo.png"],
 ["Valorant","VAL • FPS","https://playvalorant.com/","https://commons.wikimedia.org/wiki/Special:Redirect/file/Valorant_logo.svg"],
 ["PUBG: Battlegrounds","PUBG • Battle Royale","https://pubg.com/","https://commons.wikimedia.org/wiki/Special:Redirect/file/PUBG_Studios_Logo.svg"],
 ["Minecraft","MC • Sandbox","https://www.minecraft.net/","https://commons.wikimedia.org/wiki/Special:Redirect/file/Minecraft_Logo-en.svg"],
 ["Ultimate Bus Simulator","UBS • Simulation","https://play.google.com/store/apps/details?id=com.dynamicgames.ultimatetrucksimulator",""],
 ["Euro Truck Simulator 2","ETS2 • Simulation","https://eurotrucksimulator2.com/",""],
 ["Cities: Skylines","CS • Simulation","https://www.paradoxinteractive.com/games/cities-skylines/about",""],
 ["Transport Fever 2","TF2 • Strategy","https://www.transportfever2.com/",""]
];
function gameItem(g){return{id:"game-"+g[0].toLowerCase().replace(/[^a-z0-9]+/g,"-"),type:"game",title:g[0],description:g[1],image:g[3],url:g[2],createdAt:0,author:"CTRLZONE",likes:0,shares:0}}
function normalizeProduct(s){
  const x=s.data();return{id:"product-"+s.id,type:"product",title:x.name||x.title||"Product",description:x.description||"",
  image:x.imageURL||x.imageUrl||x.image||x.thumbnailUrl||"",price:x.price??"",stock:x.stock??"",createdAt:x.createdAt||0,
  author:x.shopName||x.authorName||"TUBAL HUB Shop",uid:x.createdBy||"",likes:Number(x.likes||0),shares:Number(x.shares||0),
  sponsored:x.sponsored===true,sourceCollection:"products",sourceId:s.id,url:x.productUrl||"",productUrl:x.productUrl||""}
}
async function loadProducts(){
  try{const snap=await getDocs(query(collection(db,"products"),orderBy("createdAt","desc"),limit(100)));state.products=snap.docs.map(normalizeProduct)}
  catch(e){console.warn("[Feeds] products unavailable",e);state.products=[]}
}
async function loadPeople(){
  try{
    const [usersSnap,presenceSnap]=await Promise.all([
      getDocs(query(collection(db,"users"),limit(200))),getDocs(query(collection(db,"presence"),limit(200)))
    ]);
    state.userMap.clear();state.presence.clear();
    usersSnap.forEach(s=>{const x=s.data();state.userMap.set(s.id,{uid:s.id,...x})});
    presenceSnap.forEach(s=>{const x=s.data();if(x.uid)state.presence.set(x.uid,{uid:x.uid,...x})});
    state.users=[...new Map([...state.userMap.values(),...state.presence.values()].map(u=>[u.uid,u])).values()];
    renderContacts();renderBirthdays?.();updateAvatarStatus();renderActiveGames();renderSuggested();
  }catch(e){console.warn("[Feeds] people unavailable",e)}
}
function buildFeed(){
  const raw=[...state.hubPosts.map(hubItem),...state.products,...games.map(gameItem)];
  const seen=new Set();state.items=raw.filter(x=>{const k=contentKey(x);if(seen.has(k))return false;seen.add(k);return true});
  renderStories();renderFeed(true);renderSponsored();renderTrending();renderActiveGames();renderSuggested();
}
function visible(){
  let arr=state.items.filter(x=>!state.savedMode||state.saved.has(x.id));
  if(state.filter!=="all")arr=arr.filter(x=>x.type==={products:"product",games:"game",videos:"video"}[state.filter]);
  const q=state.query.trim().toLowerCase();
  if(q)arr=arr.filter(x=>(x.title+" "+x.description+" "+x.author).toLowerCase().includes(q));
  if(state.sort==="popular"){
    arr.sort((a,b)=>totalPostReactions(b.id,b)-totalPostReactions(a.id,a)||shareTotal(b)-shareTotal(a)||millis(b.createdAt)-millis(a.createdAt));
  }else arr.sort((a,b)=>millis(b.createdAt)-millis(a.createdAt));
  return arr;
}

function reactionData(postId){
  if(!state.reactions[postId])state.reactions[postId]={};
  for(const k of REACTION_KEYS)if(!Array.isArray(state.reactions[postId][k]))state.reactions[postId][k]=[];
  return state.reactions[postId];
}
function totalPostReactions(postId,item){
  const d=reactionData(postId);return (item?.likes||0)+REACTION_KEYS.reduce((n,k)=>n+(d[k]?.length||0),0);
}
function currentReaction(postId){
  const d=reactionData(postId);for(const k of REACTION_KEYS)if(d[k].includes(state.auth?.uid))return k;return "";
}
function reactionUsers(postId){
  const d=reactionData(postId),rows=[];
  for(const k of REACTION_KEYS)(d[k]||[]).forEach(uid=>rows.push({uid,reaction:k}));
  return rows;
}
function shareTotal(item){return Number(item?.shares||0)+Number(state.shareCounts[item?.id]||0)}
function reactionLabel(postId){const k=currentReaction(postId);return k?REACTIONS[k].label:"Like"}
function reactionIcon(postId){const k=currentReaction(postId);return k?REACTIONS[k].emoji:"👍"}

function reactionSummaryMarkup(postId,compact=false){
  const d=reactionData(postId);
  const active=REACTION_KEYS.map(k=>({k,n:d[k]?.length||0})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  if(!active.length)return "<div class='reaction-summary-empty'>Be the first to react</div>";
  const pills=active.slice(0,4).map(x=>"<button class='reaction-summary' type='button' data-open-reactors='"+esc(postId)+"' data-react-filter='"+x.k+"'><span>"+REACTIONS[x.k].emoji+"</span><span class='r-count'>"+x.n+"</span></button>").join("");
  const ids=[...new Set(active.flatMap(x=>d[x.k]||[]))].slice(0,4);
  const avatars=ids.map(uid=>{
    const u=userRecord(uid)||{uid,name:"Member"};return "<span class='reaction-avatar' title='"+esc(displayName(u))+"'>"+(photoOf(u)?"<img src='"+esc(photoOf(u))+"' alt=''>":esc(initials(displayName(u))))+"<span class='mini-online "+(onlineOf(uid)?"online":"")+"' aria-hidden='true'></span></span>"
  }).join("");
  return "<div class='reaction-summary-inner'>"+pills+"<div class='reaction-avatars'>"+avatars+"</div>"+(active.length>4?"<button class='reaction-more' type='button' data-open-reactors='"+esc(postId)+"'>+"+(active.length-4)+"</button>":"")+"</div>";
}
function renderReactionZone(x){
  return "<div class='reaction-zone'><div class='reaction-summary-row'>"+reactionSummaryMarkup(x.id)+"</div></div>";
}
function postMarkup(x){
  const caption=x.text||x.description||"",reacted=!!currentReaction(x.id),shares=shareTotal(x);
  let body="";
  if(x.type==="product")body="<div class='product-card'><div class='product-media'>"+(x.image?"<img src='"+esc(x.image)+"' alt='' loading='lazy'>":"◈")+"</div><div class='product-info'><div class='product-info-top'><div><h3>"+esc(x.title)+"</h3><div class='product-price'>"+(x.price!==""?"₱"+esc(x.price):"")+"</div></div>"+(x.stock!==""?"<span class='stock-pill'>"+esc(x.stock)+" in stock</span>":"")+"</div><button class='buy-btn' data-buy='"+esc(x.id)+"' type='button'>Open in Shop</button></div></div>";
  else if(x.type==="game")body="<div class='game-card'><div class='game-cover'>"+(x.image?"<img src='"+esc(x.image)+"' alt='' loading='lazy'>":"<b>"+esc(x.title.slice(0,2))+"</b>")+"</div><div class='game-info'><h3>"+esc(x.title)+"</h3><p>"+esc(x.description)+"</p><a class='play-btn' href='"+esc(x.url)+"' target='_blank' rel='noopener'>Open Game →</a></div></div>";
  else if(x.type==="video"&&x.mediaUrl)body="<video class='post-media feed-video' controls preload='metadata' src='"+esc(x.mediaUrl)+"'></video>";
  else if(x.type==="audio"&&x.mediaUrl)body="<audio class='post-audio' controls preload='metadata' src='"+esc(x.mediaUrl)+"'></audio>";
  else if(x.image)body="<img class='post-media' src='"+esc(x.image)+"' alt='' loading='lazy'>";
  else if(x.title)body="<div class='feed-article-content'><h3>"+esc(x.title)+"</h3><p>"+esc(x.description||x.text||"")+"</p></div>";
  return "<article class='post-card' data-id='"+esc(x.id)+"'><div class='post-head'>"+avatarMarkup({uid:x.uid,displayName:x.author,photoURL:x.photo})+"<div class='post-meta'><b>"+esc(x.author||"Member")+"</b><span>"+esc(timeLabel(x.createdAt))+" · Everyone</span></div>"+(x.sponsored?"<span class='post-sponsor'>Sponsored</span>":"")+"<span class='post-status "+(onlineOf(x.uid)?"online":"")+"' aria-label='"+(onlineOf(x.uid)?"Online":"Offline")+"'></span></div><div class='post-body'>"+(caption?"<p class='post-caption'>"+esc(caption)+"</p>":"")+body+"</div>"+renderReactionZone(x)+"<div class='post-footer'><div class='post-stats'><span class='like-stat' data-react-total>"+(totalPostReactions(x.id,x)||"No reactions yet")+(totalPostReactions(x.id,x)?" reactions":"")+"</span><span>"+(x.comments?esc(x.comments)+" comments":"")+(shares?" · <span class='share-count-pop' data-share-count>"+shares+" shares</span>":"")+"</span></div><div class='post-actions'><button class='post-action react-icon "+(reacted?"reacted":"")+"' data-action='react' type='button'><span class='reaction-main-icon'>"+reactionIcon(x.id)+"</span><span data-reaction-label>"+reactionLabel(x.id)+"</span></button><button class='post-action' data-action='comment' type='button'>Comment</button><button class='post-action' data-action='share' type='button'>Share</button></div></div></article>";
}
function renderStories(){
  const box=document.getElementById("stories");if(!box)return;
  box.innerHTML="<button class='story-card create' id='createStory' type='button'><span class='story-plus'>+</span><strong>Create Story</strong></button>";
  const source=[...new Map(state.items.filter(x=>x.author).map(x=>[x.author,x])).values()].slice(0,10);
  source.forEach((x,i)=>{
    const photo=x.photo||x.image||"",b=document.createElement("button");b.type="button";b.className="story-card"+(i===0?" active-story":"");
    b.innerHTML="<div class='story-media'>"+(photo?"<img src='"+esc(photo)+"' alt='' loading='lazy'>":"")+"</div><div class='story-overlay'></div>"+avatarMarkup({uid:x.uid,displayName:x.author,photoURL:x.photo},"story-avatar")+"<span class='story-name'>"+esc(x.author)+"</span>";
    b.onclick=()=>x.type==="game"&&x.url?window.open(x.url,"_blank","noopener"):null;box.appendChild(b);
  });
  document.getElementById("createStory")?.addEventListener("click",openPostModal);
}
function renderFeed(reset){
  const list=visible(),box=document.getElementById("feedList");if(!box||state.loading)return;
  if(reset){state.page=0;box.innerHTML=""}
  const start=state.page*state.pageSize,slice=list.slice(start,start+state.pageSize);
  if(!slice.length&&state.page===0){box.innerHTML="<div class='feed-empty'><strong>No posts in your feed</strong><span>Published TUBAL HUB content will appear here.</span></div>";return}
  state.loading=true;const sk=document.createElement("div");sk.className="load-more-skeleton";sk.innerHTML="<div class='skeleton'></div>";box.appendChild(sk);
  setTimeout(()=>{sk.remove();const frag=document.createDocumentFragment();slice.forEach(x=>{const wrap=document.createElement("div");wrap.innerHTML=postMarkup(x);frag.appendChild(wrap.firstElementChild)});box.appendChild(frag);state.page++;state.loading=false;bindPosts()},100);
}
function renderContacts(){
  const box=document.getElementById("contactsList");if(!box)return;
  const contacts=state.users.filter(u=>u.uid&&u.uid!==state.auth?.uid).sort((a,b)=>Number(onlineOf(b.uid))-Number(onlineOf(a.uid))).slice(0,12);
  box.innerHTML=contacts.length?contacts.map(u=>"<div class='contact-row'>"+avatarMarkup(u,"contact-avatar")+"<div class='contact-copy'><b>"+esc(displayName(u))+"</b><span>"+(onlineOf(u.uid)?"Online":"Offline")+"</span></div><span class='contact-dot "+(onlineOf(u.uid)?"online":"")+"' aria-hidden='true'></span></div>").join(""):"<div class='feed-side-meta'>No registered contacts are available yet.</div>";
}
function renderBirthdays(){
  const box=document.getElementById("birthdayBox");if(!box)return;
  const today=new Date(),items=state.users.filter(u=>{
    const raw=u.birthday||u.birthDate||u.dob||"";if(!raw)return false;const d=new Date(raw);return !Number.isNaN(d.getTime())&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
  }).slice(0,6);
  box.innerHTML=items.length?items.map(u=>"<div class='birthday-row'>"+avatarMarkup(u,"contact-avatar")+"<span><b>"+esc(displayName(u))+"</b><small>Birthday today</small></span></div>").join(""):"<strong>No birthdays published.</strong><br>Only real profile birthday data will appear here.";
}
function renderTrending(){
  const box=document.getElementById("trendingNow"); if(!box)return;
  const items=state.items
    .map(x=>({x,score:totalPostReactions(x.id,x)+shareTotal(x)}))
    .filter(v=>v.score>0)
    .sort((a,b)=>b.score-a.score||millis(b.x.createdAt)-millis(a.x.createdAt))
    .slice(0,6);
  if(!items.length){box.innerHTML="<div class='feed-side-meta'>No trending content yet.</div>";return}
  box.innerHTML=items.map((v,i)=>{
    const x=v.x, title=x.title||x.description||"TUBAL HUB post";
    return "<button class='trending-item' type='button' data-trend-id='"+esc(x.id)+"'><span class='trend-rank'>"+(i+1)+"</span><span class='trend-copy'><b>"+esc(title.slice(0,70))+"</b><small>"+esc(x.author||"Member")+" · "+v.score+" reactions/shares</small></span></button>";
  }).join("");
  box.querySelectorAll("[data-trend-id]").forEach(b=>b.onclick=()=>{
    const target=document.querySelector(".post-card[data-id='"+CSS.escape(b.dataset.trendId)+"']");
    target?.scrollIntoView({behavior:"smooth",block:"center"});
  });
}
function renderActiveGames(){
  const box=document.getElementById("activeGames"); if(!box)return;
  const active=[...state.presence.values()].filter(u=>u.uid&&u.online===true&&(u.game||u.currentGame||u.gameTitle||u.playing));
  const unique=[...new Map(active.map(u=>[(u.game||u.currentGame||u.gameTitle||u.playing),u])).values()].slice(0,8);
  if(!unique.length){box.innerHTML="<div class='feed-side-meta'>No live game activity yet.</div>";return}
  box.innerHTML=unique.map(u=>{
    const game=u.game||u.currentGame||u.gameTitle||u.playing;
    return "<div class='active-game-row'>"+avatarMarkup(u,"contact-avatar")+"<div class='active-game-copy'><b>"+esc(displayName(u))+"</b><span>Playing "+esc(game)+"</span></div><span class='contact-dot online' aria-label='Online'></span></div>";
  }).join("");
}
function renderSuggested(){
  const box=document.getElementById("suggestedForYou"); if(!box)return;
  const candidates=state.users.filter(u=>u.uid&&u.uid!==state.auth?.uid)
    .sort((a,b)=>Number(onlineOf(b.uid))-Number(onlineOf(a.uid)))
    .slice(0,6);
  if(!candidates.length){box.innerHTML="<div class='feed-side-meta'>No member suggestions yet.</div>";return}
  box.innerHTML=candidates.map(u=>"<button class='suggested-row' type='button' data-suggested-uid='"+esc(u.uid)+"'>"+avatarMarkup(u,"contact-avatar")+"<span class='suggested-copy'><b>"+esc(displayName(u))+"</b><small>"+(onlineOf(u.uid)?"Online member":"TUBAL HUB member")+"</small></span><span class='suggested-plus'>+</span></button>").join("");
  box.querySelectorAll("[data-suggested-uid]").forEach(b=>b.onclick=()=>{
    const u=userRecord(b.dataset.suggestedUid);
    if(!u)return;
    showNotice("Member profile: "+displayName(u));
  });
}
function renderSponsored(){
  const box=document.getElementById("sponsoredBox");if(!box)return;
  const p=state.products.find(x=>x.sponsored===true);if(!p){box.innerHTML="<div class='feed-side-meta'>No sponsored product published.</div>";return}
  box.innerHTML="<div class='sponsored-art'>"+(p.image?"<img src='"+esc(p.image)+"' alt='' loading='lazy'>":"◈")+"</div><div class='sponsored-info'><h4>"+esc(p.title)+"</h4><p>"+esc(p.description||"")+"</p>"+(p.price!==""?"<strong class='sponsor-price'>"+esc(String(p.price))+"</strong>":"")+"</div>";
}
function refreshPost(postId,animateFrom=null){
  const old=document.querySelector(".post-card[data-id='"+CSS.escape(postId)+"']");if(!old)return;
  const item=state.items.find(x=>x.id===postId);if(!item)return;
  const index=[...document.querySelectorAll(".post-card")].indexOf(old),wrap=document.createElement("div");wrap.innerHTML=postMarkup(item);
  const next=wrap.firstElementChild;old.replaceWith(next);bindPost(next);
  if(animateFrom!==null){const el=next.querySelector("[data-react-total]"),to=totalPostReactions(postId,item);if(el)animateNumber(el,animateFrom,to," reactions")}
}
function animateNumber(el,from,to,suffix=""){
  const start=Number(from)||0,end=Number(to)||0;if(start===end){el.textContent=end?end+suffix:"No reactions yet";return}
  const t0=performance.now(),dur=420;
  function step(now){const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3),v=Math.round(start+(end-start)*e);el.textContent=v?v+suffix:"No reactions yet";if(p<1)requestAnimationFrame(step)}
  el.classList.remove("count-pop");void el.offsetWidth;el.classList.add("count-pop");requestAnimationFrame(step);
}
function burst(btn,count=8){
  const layer=document.createElement("span");layer.className="like-confetti";for(let i=0;i<count;i++){const p=document.createElement("i");const a=(Math.PI*2*i/count)+(Math.random()-.5)*.18,d=26+Math.random()*22;p.style.left="50%";p.style.top="50%";p.style.setProperty("--dx",Math.cos(a)*d+"px");p.style.setProperty("--dy",Math.sin(a)*d+"px");layer.appendChild(p)}btn.appendChild(layer);setTimeout(()=>layer.remove(),900);
}
function reactionPicker(){
  let p=document.getElementById("reactionPicker");if(p)return p;
  p=document.createElement("div");p.id="reactionPicker";p.className="reaction-picker";p.setAttribute("role","menu");
  p.innerHTML=QUICK_REACTIONS.map(k=>"<button class='reaction-choice' type='button' data-reaction='"+k+"' data-name='"+REACTIONS[k].label+"'>"+REACTIONS[k].emoji+"</button>").join("");
  document.body.appendChild(p);
  p.addEventListener("mouseenter",()=>clearTimeout(pickerCloseTimer));
  p.addEventListener("mouseleave",()=>schedulePickerClose());
  p.addEventListener("click",e=>{const b=e.target.closest("[data-reaction]");if(!b)return;reactionChoiceBurst(b);if(pickerState.targetType==="comment")addCommentReact(pickerState.commentId,b.dataset.reaction);else addReact(pickerState.postId,b.dataset.reaction);closeReactionPicker()});
  return p;
}
function positionPicker(p,button){
  const r=button.getBoundingClientRect(),pw=p.offsetWidth||300,ph=p.offsetHeight||60;
  let left=r.left+r.width/2-pw/2,top=r.top-ph-10;
  left=Math.max(8,Math.min(left,innerWidth-pw-8));if(top<8)top=r.bottom+10;
  p.style.left=left+"px";p.style.top=top+"px";
}
function openReactionPicker({postId,button,targetType="post",commentId=null}){
  const p=reactionPicker();clearTimeout(pickerCloseTimer);pickerState={postId,targetType,commentId,button,longPressTriggered:false};
  positionPicker(p,button);p.classList.add("open");p.classList.toggle("glitch",document.body.classList.contains("theme-midnight"));
}
function closeReactionPicker(){const p=document.getElementById("reactionPicker");if(!p)return;p.classList.remove("open");pickerState={postId:null,targetType:"post",commentId:null,button:null,longPressTriggered:false}}
function schedulePickerClose(){clearTimeout(pickerCloseTimer);pickerCloseTimer=setTimeout(closeReactionPicker,190)}
function reactionChoiceBurst(btn){
  navigator.vibrate?.(10);const layer=document.createElement("span");layer.className="react-choice-burst";
  for(let i=0;i<8;i++){const p=document.createElement("i");p.style.setProperty("--a",(i*45)+"deg");layer.appendChild(p)}
  btn.appendChild(layer);setTimeout(()=>layer.remove(),520);
}
function startReactionHover(card,button){
  clearTimeout(pickerTimer);pickerTimer=setTimeout(()=>openReactionPicker({postId:card.dataset.id,button}),500);
}
function bindPost(card){
  if(!card||card.dataset.bound)return;card.dataset.bound="1";
  const react=card.querySelector("[data-action='react']");
  let pressTimer=null;
  react?.addEventListener("mouseenter",()=>startReactionHover(card,react));
  react?.addEventListener("mouseleave",()=>{clearTimeout(pickerTimer);schedulePickerClose()});
  react?.addEventListener("pointerdown",e=>{
    if(e.pointerType!=="touch")return;
    clearTimeout(pressTimer);pickerState.longPressTriggered=false;
    pressTimer=setTimeout(()=>{pickerState.longPressTriggered=true;openReactionPicker({postId:card.dataset.id,button:react});navigator.vibrate?.(10)},500);
  });
  ["pointerup","pointercancel"].forEach(t=>react?.addEventListener(t,()=>clearTimeout(pressTimer)));
  react?.addEventListener("click",e=>{
    if(pickerState.longPressTriggered){e.preventDefault();pickerState.longPressTriggered=false;return}
    const id=card.dataset.id,k=currentReaction(id)||"like";addReact(id,k);
  });
  card.querySelector("[data-action='comment']")?.addEventListener("click",()=>openComments(card.dataset.id));
  card.querySelector("[data-action='share']")?.addEventListener("click",()=>openShareModal(card.dataset.id));
  card.querySelector("[data-open-reactors]")?.addEventListener("click",()=>openReactors(card.dataset.id));
  card.querySelectorAll("[data-open-reactors]").forEach(b=>b.addEventListener("click",()=>openReactors(card.dataset.id)));
  card.querySelector("[data-buy]")?.addEventListener("click",()=>location.href="shop.html");
  if(totalPostReactions(card.dataset.id,state.items.find(x=>x.id===card.dataset.id))>=10)card.classList.add("high-reaction");
}
function bindPosts(){document.querySelectorAll(".post-card").forEach(bindPost)}
async function addReact(postId,reaction){
  if(!state.auth){showNotice("Sign in to react.");return}
  const d=reactionData(postId),before=totalPostReactions(postId,state.items.find(x=>x.id===postId));
  for(const k of REACTION_KEYS)d[k]=d[k].filter(uid=>uid!==state.auth.uid);
  d[reaction].push(state.auth.uid);writeLocal("tubalhub-feed-reactions",state.reactions);
  const card=document.querySelector(".post-card[data-id='"+CSS.escape(postId)+"']"),btn=card?.querySelector("[data-action='react']");
  if(btn){btn.classList.remove("reacted");void btn.offsetWidth;btn.classList.add("reacted");burst(btn,8);btn.querySelector(".reaction-main-icon")?.classList.add("pop")}
  refreshPost(postId,before);renderTrending();
  const after=totalPostReactions(postId,state.items.find(x=>x.id===postId));if(after>=10&&before<10){const c=document.querySelector(".post-card[data-id='"+CSS.escape(postId)+"']");if(c)burst(c.querySelector("[data-action='react']"),16)}
  try{await setDoc(doc(db,"feedReactions",postId+"_"+state.auth.uid),{postId,uid:state.auth.uid,reaction,updatedAt:serverTimestamp()},{merge:true})}
  catch(e){if(e?.code!=="permission-denied")console.warn("[Feeds] remote reaction unavailable",e)}
}
function toggleCommentReaction(id,reaction){
  const all=state.commentReactions[id]||(state.commentReactions[id]={});for(const k of REACTION_KEYS){if(!Array.isArray(all[k]))all[k]=[];all[k]=all[k].filter(x=>x!==state.auth?.uid)}
  all[reaction].push(state.auth?.uid||"local");writeLocal("tubalhub-feed-comment-reactions",state.commentReactions);
  renderComments(state.currentCommentId);showNotice("Reaction added.",true);
}
function addCommentReact(id,reaction){if(!id||!state.auth)return showNotice("Sign in to react.");toggleCommentReaction(id,reaction)}
function commentReactionMarkup(id){
  const all=state.commentReactions[id]||{},parts=REACTION_KEYS.map(k=>({k,n:all[k]?.length||0})).filter(x=>x.n).slice(0,3);
  return parts.length?parts.map(x=>"<button class='comment-reaction-pill' type='button' data-comment-react='"+id+"' data-comment-reaction='"+x.k+"'>"+REACTIONS[x.k].emoji+" "+x.n+"</button>").join(""):"";
}

function commentsFor(postId){return (state.comments[postId]||[]).slice().sort((a,b)=>millis(a.createdAt)-millis(b.createdAt))}
function renderCommentText(text){
  return esc(text).replace(/(^|\s)(@[A-Za-z0-9_.-]+)/g,'$1<span class="mention">$2</span>');
}
function commentMarkup(c,depth=0){
  const me=state.auth?.uid===c.uid,isReply=depth>0;
  const replies=commentsFor(state.currentCommentId).filter(x=>x.parentId===c.id);
  return "<div class='comment-item "+(c._new?"new":"")+"' data-comment-id='"+esc(c.id)+"'><div class='comment-row'>"+avatarMarkup({uid:c.uid,displayName:c.authorName,photoURL:c.authorPhotoURL})+"<div class='comment-bubble-wrap'><div class='comment-bubble'><div class='comment-author-line'><span class='comment-author'>"+esc(c.authorName||"Member")+"</span>"+(me?"<span class='you-badge'>YOU</span>":"")+"<span class='comment-time'>"+esc(timeLabel(c.createdAt))+"</span>"+(c.edited?"<span class='comment-edited'>(edited)</span>":"")+"</div><div class='comment-text'>"+renderCommentText(c.text||"")+"</div>"+(c.photoData?"<img class='comment-inline-photo' src='"+esc(c.photoData)+"' alt='Attached photo' loading='lazy'>":"")+"</div><div class='comment-actions'><button type='button' data-comment-react='"+esc(c.id)+"' data-comment-reaction='like'>"+REACTIONS.like.emoji+" React</button><button type='button' data-reply='"+esc(c.id)+"' data-reply-name='"+esc(c.authorName||"Member")+"'>Reply</button>"+commentReactionMarkup(c.id)+"</div></div>"+(me?"<div class='comment-menu'><button type='button' data-menu-comment='"+esc(c.id)+"'>•••</button><div class='comment-menu-pop'><button type='button' data-edit-comment='"+esc(c.id)+"'>Edit</button><button type='button' data-delete-comment='"+esc(c.id)+"'>Delete</button></div></div>":"")+"</div>"+((replies.length)?("<div class='comment-replies'>"+replies.map(r=>commentMarkup(r,depth+1)).join("")+"</div>"):"")+"</div>";
}
function renderComments(postId){
  const box=document.getElementById("commentList"),bar=document.getElementById("commentReactionBar");if(!box||!bar)return;
  const post=state.items.find(x=>x.id===postId);bar.innerHTML=reactionSummaryMarkup(postId);
  const all=commentsFor(postId).filter(c=>!c.parentId),slice=all.slice(0,state.commentLimit);
  if(!all.length)box.innerHTML="<div class='empty-comments'><span class='empty-icon'>💬</span><strong>No comments yet</strong><span>Be the first to say something.</span></div>";
  else{
    box.innerHTML=slice.map(c=>commentMarkup(c,0)).join("");
    if(all.length>slice.length)box.insertAdjacentHTML("beforeend","<button class='view-more-comments' id='viewMoreComments' type='button'>View "+(all.length-slice.length)+" more</button>");
  }
  bindCommentUI();document.getElementById("commentInput")?.focus({preventScroll:true});
}
function bindCommentUI(){
  document.querySelectorAll("[data-reply]").forEach(b=>b.onclick=()=>{state.replyingTo=b.dataset.reply;const input=document.getElementById("commentInput");input.value="@"+b.dataset.replyName+" "+input.value;input.focus()});
  document.querySelectorAll("[data-menu-comment]").forEach(b=>b.onclick=()=>b.parentElement.classList.toggle("open"));
  document.querySelectorAll("[data-edit-comment]").forEach(b=>b.onclick=()=>startEditComment(b.dataset.editComment));
  document.querySelectorAll("[data-delete-comment]").forEach(b=>b.onclick=()=>askDeleteComment(b.dataset.deleteComment));
  document.querySelectorAll("[data-comment-react]").forEach(b=>{
    b.onclick=()=>{const id=b.dataset.commentReact,kind=b.dataset.commentReaction||"like";toggleCommentReaction(id,kind);if(b.closest(".comment-item"))burst(b,8)}
    if(b.dataset.commentReaction==="like")b.oncontextmenu=e=>{e.preventDefault();openReactionPicker({targetType:"comment",commentId:b.dataset.commentReact,button:b})}
  });
  document.getElementById("viewMoreComments")?.addEventListener("click",()=>{state.commentLimit+=8;renderComments(state.currentCommentId)});
}
function startEditComment(id){
  const c=(state.comments[state.currentCommentId]||[]).find(x=>x.id===id);if(!c||c.uid!==state.auth?.uid)return;
  state.editingCommentId=id;renderComments(state.currentCommentId);
  const wrap=document.querySelector("[data-comment-id='"+CSS.escape(id)+"'] .comment-bubble-wrap");
  if(wrap)wrap.insertAdjacentHTML("beforeend","<div class='comment-edit' data-edit-wrap='"+esc(id)+"'><input value='"+esc(c.text)+"' maxlength='1000'><button type='button' data-save-edit='"+esc(id)+"'>Save</button></div>");
  document.querySelector("[data-save-edit='"+CSS.escape(id)+"']")?.addEventListener("click",saveEditComment);
}
async function saveEditComment(){
  const id=state.editingCommentId,wrap=document.querySelector("[data-edit-wrap='"+CSS.escape(id)+"']"),input=wrap?.querySelector("input"),text=input?.value.trim();if(!id||!text)return;
  const arr=state.comments[state.currentCommentId]||[],c=arr.find(x=>x.id===id);if(!c)return;c.text=text;c.edited=true;c.updatedAt=Date.now();writeLocal("tubalhub-feed-comments",state.comments);
  try{if(!String(id).startsWith("local-"))await updateDoc(doc(db,"feedComments",id),{text,edited:true,updatedAt:serverTimestamp()})}catch(e){if(e?.code!=="permission-denied")console.warn(e)}
  state.editingCommentId=null;renderComments(state.currentCommentId);showNotice("Comment updated.",true);
}
function askDeleteComment(id){state.deleteCommentId=id;document.getElementById("deleteModal").hidden=false}
async function deleteComment(){
  const id=state.deleteCommentId;if(!id)return;const postId=state.currentCommentId;
  state.comments[postId]=(state.comments[postId]||[]).filter(c=>c.id!==id&&c.parentId!==id);writeLocal("tubalhub-feed-comments",state.comments);
  try{if(!String(id).startsWith("local-"))await deleteDoc(doc(db,"feedComments",id))}catch(e){if(e?.code!=="permission-denied")console.warn(e)}
  document.getElementById("deleteModal").hidden=true;state.deleteCommentId=null;renderComments(postId);showNotice("Comment deleted.",true);
}
async function addComment(){
  const input=document.getElementById("commentInput"),text=input?.value.trim();if(!state.currentCommentId||!text)return;
  if(!state.auth){showNotice("Sign in to comment.");return}
  const id="local-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
  const item={id,postId:state.currentCommentId,uid:state.auth.uid,authorName:displayName(state.auth),authorPhotoURL:photoOf(state.auth),
    text,parentId:state.replyingTo||null,createdAt:Date.now(),edited:false,photoData:state.commentPhotoData||""};
  if(!Array.isArray(state.comments[state.currentCommentId]))state.comments[state.currentCommentId]=[];
  state.comments[state.currentCommentId].push(item);writeLocal("tubalhub-feed-comments",state.comments);
  input.value="";state.replyingTo=null;state.commentPhotoData="";clearCommentPhotoPreview();renderComments(state.currentCommentId);
  const send=document.getElementById("sendComment");send?.classList.remove("pop");void send?.offsetWidth;send?.classList.add("pop");
  try{
    const remote=await addDoc(collection(db,"feedComments"),{postId:item.postId,uid:item.uid,authorName:item.authorName,authorPhotoURL:item.authorPhotoURL,text:item.text,parentId:item.parentId,photoData:item.photoData,edited:false,createdAt:serverTimestamp()});
    const arr=state.comments[state.currentCommentId];const local=arr.find(x=>x.id===id);if(local)local.remoteId=remote.id;
  }catch(e){if(e?.code!=="permission-denied")console.warn("[Feeds] remote comment unavailable",e)}
}
function openComments(postId){
  state.currentCommentId=postId;state.commentLimit=6;state.replyingTo=null;state.commentPhotoData="";
  document.getElementById("commentModal").hidden=false;updateAvatarStatus();renderComments(postId);toggleEmoji(false);showTyping(false);
}
function closeComments(){document.getElementById("commentModal").hidden=true;toggleEmoji(false);state.currentCommentId=null}
function updateAvatarStatus(){
  const a=document.getElementById("commentAvatar"),c=document.getElementById("createAvatar"),u=state.auth||{};
  [a,c].forEach(el=>{if(!el)return;el.innerHTML=(photoOf(u)?"<img src='"+esc(photoOf(u))+"' alt=''>":esc(initials(displayName(u))))+"<span class='avatar-status "+(u.uid&&onlineOf(u.uid)?"online":"")+"' aria-hidden='true'></span>"});
}

async function openReactors(postId){
  const modal=document.getElementById("reactionWhoModal"),list=document.getElementById("reactionWhoList");if(!modal||!list)return;
  const rows=reactionUsers(postId);list.innerHTML=rows.length?rows.map(r=>{const u=userRecord(r.uid)||{uid:r.uid,name:"Community member"};return "<div class='reaction-who-row'>"+avatarMarkup(u,"reaction-who-avatar")+"<div class='reaction-who-copy'><b>"+esc(displayName(u))+"</b><span>"+esc(REACTIONS[r.reaction].label)+"</span></div><span class='reaction-who-emoji'>"+REACTIONS[r.reaction].emoji+"</span></div>"}).join(""):"<div class='feed-side-meta'>No reactions yet.</div>";
  modal.hidden=false;
}

let sharePostId=null;
function makeShareUrl(id){return location.origin+location.pathname+"#feed-"+encodeURIComponent(id)}
function sharePayload(){
  const item=state.items.find(x=>x.id===sharePostId)||{title:"TUBAL HUB",description:""};
  const url=makeShareUrl(sharePostId),note=document.getElementById("shareNote")?.value.trim();
  const text=(note||item.title||item.description||"Shared from TUBAL HUB").trim();
  return {item,url,text};
}
function openShareModal(id){
  sharePostId=id;const item=state.items.find(x=>x.id===id);document.getElementById("shareTitle").textContent=item?.title||"Share post";
  document.getElementById("shareUrl").value=makeShareUrl(id);document.getElementById("shareNote").value="";
  document.getElementById("shareBackdrop").classList.add("open");document.getElementById("shareModal").classList.add("open");
}
function closeShareModal(){document.getElementById("shareBackdrop").classList.remove("open");document.getElementById("shareModal").classList.remove("open")}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch(_){const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();return true}}
function bumpShareCount(id){
  state.shareCounts[id]=Number(state.shareCounts[id]||0)+1;writeLocal("tubalhub-feed-shares",state.shareCounts);
  const el=document.querySelector(".post-card[data-id='"+CSS.escape(id)+"'] [data-share-count]");
  renderTrending();if(el){el.textContent=shareTotal(state.items.find(x=>x.id===id))+" shares";el.classList.remove("pop");void el.offsetWidth;el.classList.add("pop")}
  else{const stat=document.querySelector(".post-card[data-id='"+CSS.escape(id)+"'] .post-stats");if(stat&&shareTotal(state.items.find(x=>x.id===id)))stat.lastElementChild.innerHTML=(state.items.find(x=>x.id===id)?.comments||"")+" comments · <span class='share-count-pop pop' data-share-count>"+shareTotal(state.items.find(x=>x.id===id))+" shares</span>"}
}
async function shareTo(platform){
  if(!sharePostId)return;const {item,url,text}=sharePayload();let opened=false;
  const enc=encodeURIComponent;
  switch(platform){
    case "facebook":opened=!!window.open("https://www.facebook.com/sharer/sharer.php?u="+enc(url)+"&quote="+enc(text),"_blank","noopener,noreferrer,width=760,height=640");break;
    case "x":opened=!!window.open("https://twitter.com/intent/tweet?url="+enc(url)+"&text="+enc(text),"_blank","noopener,noreferrer,width=720,height=620");break;
    case "whatsapp":opened=!!window.open("https://wa.me/?text="+enc(text+"\n"+url),"_blank","noopener,noreferrer");break;
    case "telegram":opened=!!window.open("https://t.me/share/url?url="+enc(url)+"&text="+enc(text),"_blank","noopener,noreferrer");break;
    case "email":location.href="mailto:?subject="+enc(item.title||"Shared from TUBAL HUB")+"&body="+enc(text+"\n\n"+url);opened=true;break;
    case "messenger":await copyText(text+"\n"+url);opened=!!window.open("https://www.facebook.com/messages/","_blank","noopener,noreferrer");showNotice("Link copied for Messenger.",true);break;
    case "instagram":await copyText(text+"\n"+url);opened=!!window.open("https://www.instagram.com/","_blank","noopener,noreferrer");showNotice("Link copied for Instagram.",true);break;
    case "discord":await copyText(text+"\n"+url);opened=!!window.open("https://discord.com/app","_blank","noopener,noreferrer");showNotice("Link copied for Discord.",true);break;
    case "copy":await copyText(url);showNotice("Link copied!",true);opened=true;flashCopied();break;
  }
  if(opened){bumpShareCount(sharePostId);showNotice(platform==="copy"?"Link copied!":platform+" share opened.",true)}
}
function flashCopied(){
  const b=document.getElementById("copyShare");if(!b)return;const old=b.textContent;b.textContent="✓ Copied";b.classList.add("copied");setTimeout(()=>{b.textContent=old;b.classList.remove("copied")},1200);
}
async function nativeShare(){
  if(!navigator.share||!sharePostId)return;const {item,url,text}=sharePayload();
  try{await navigator.share({title:item.title||"TUBAL HUB",text,url});bumpShareCount(sharePostId);showNotice("Shared successfully.",true)}catch(e){if(e?.name!=="AbortError")showNotice("Device share was cancelled.");}
}
async function shareToHub(){
  const {item,url,text}=sharePayload();if(!state.auth){showNotice("Sign in to share to TUBAL HUB.");return}
  try{await publishHubPost({contentType:"post",title:"Shared: "+(item.title||"TUBAL HUB"),text:text+"\n\n"+url,destinations:["feeds","community"],sourceCollection:"feeds-share",sourceId:sharePostId});closeShareModal();showNotice("Shared to TUBAL HUB.",true)}catch(e){showNotice(e?.code==="permission-denied"?"Publishing is blocked by Firestore Rules.":"Could not publish the share.")}
}

function openPostModal(){document.getElementById("postModal").hidden=false;document.getElementById("postText").focus()}
function closePostModal(){document.getElementById("postModal").hidden=true;clearPostPreview();document.getElementById("postText").value=""}
async function compressImage(file,max=900,q=.74){
  return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL("image/jpeg",q))};img.onerror=reject;img.src=url});
}
function filePreview(file,targetId){
  const target=document.getElementById(targetId);if(!target)return;target.hidden=false;const url=URL.createObjectURL(file);
  target.dataset.objectUrl=url;target.innerHTML=file.type.startsWith("video/")?"<video controls muted playsinline src='"+url+"'></video>":"<img src='"+url+"' alt='Preview'>";
}
function clearPostPreview(){
  const t=document.getElementById("postPreview");if(t?.dataset.objectUrl)URL.revokeObjectURL(t.dataset.objectUrl);if(t){t.hidden=true;t.innerHTML="";delete t.dataset.objectUrl}
  state.postFile=null;const n=document.getElementById("postFileName");if(n)n.textContent="No media attached";
}
async function uploadPostMedia(file){
  if(!file)return "";
  try{
    storage??=getStorage(app);
    const data=file.type.startsWith("image/")?await (await fetch(await compressImage(file))).blob():file;
    const path="feeds/"+state.auth.uid+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const ref=storageRef(storage,path);await uploadBytes(ref,data,{contentType:file.type});return await getDownloadURL(ref);
  }catch(e){console.warn("[Feeds] storage upload unavailable",e);showNotice("Media upload is unavailable; publishing text only.");return ""}
}
async function publishPost(e){
  e.preventDefault();if(!state.auth){showNotice("Sign in to create a post.");return}
  const button=document.getElementById("publishPostBtn"),text=document.getElementById("postText").value.trim();if(!text&&!state.postFile){showNotice("Write something or attach media.");return}
  button.disabled=true;
  try{
    const media=await uploadPostMedia(state.postFile);
    await publishHubPost({contentType:"post",text,mediaUrl:media,imageUrl:state.postFile?.type.startsWith("image/")?media:"",sourceCollection:"feeds",destinations:["feeds","community"]});
    closePostModal();showNotice("Post published to TUBAL HUB.",true);
  }catch(err){console.error(err);showNotice(err?.code==="permission-denied"?"Publishing is blocked by Firestore Rules.":"Could not publish the post.")}
  finally{button.disabled=false}
}
function clearCommentPhotoPreview(){
  const t=document.getElementById("commentPhotoPreview");if(t){t.hidden=true;t.innerHTML=""}
  state.commentPhotoData="";
}
async function attachCommentPhoto(file){
  if(!file)return;
  try{
    state.commentPhotoData=file.type==="image/gif"?await (await fetch(URL.createObjectURL(file))).then(r=>r.blob()).then(b=>new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})):await compressImage(file,720,.7);
    const t=document.getElementById("commentPhotoPreview");t.hidden=false;t.innerHTML="<button type='button' id='clearCommentPhoto'>×</button><img src='"+esc(state.commentPhotoData)+"' alt='Attached photo'>";
    document.getElementById("clearCommentPhoto").onclick=clearCommentPhotoPreview;
  }catch(e){showNotice("Could not prepare the photo.")}
}

function showTyping(active){const el=document.getElementById("typingIndicator");if(!el)return;el.hidden=!active}
function setupTyping(){
  const input=document.getElementById("commentInput");if(!input)return;
  input.addEventListener("input",()=>{clearTimeout(typingTimer);showTyping(!!input.value.trim());typingTimer=setTimeout(()=>showTyping(false),1200)});
}
function toggleEmoji(open=true){
  const p=document.getElementById("emojiPicker");if(!p)return;p.hidden=!open;
  if(open){renderEmojiGrid();document.getElementById("emojiSearch")?.focus()}
}
function buildEmojiBank(){
  if(buildEmojiBank.cache)return buildEmojiBank.cache;
  const set=new Set(Array.from("😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫡🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾🙈🙉🙊💋💯🔥✨⭐🌟💫⚡🌈☀️🌙🌎🌍🌏🌲🌳🌴🌵🌻🌹🌷🌸🌺🍀🍁🍂🍃🍎🍉🍇🍓🍒🥭🍍🥝🍌🍔🍕🍟🌭🌮🍜🍣🍩🍪🍰🍫🍿☕🧃🥤⚽🏀🏈⚾🎾🏐🏆🎮🕹️🎲🎯🚗🏍️🚌🚎🚓✈️🚀🚲🏠🏢💡📱💻⌨️🖱️📷🎥🎧🎤🎵🎶📚📝💰💎🎁🎈🎉❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝👍👎👏🙌🙏👌🤝✌️🤞🤟🤘💪🫶👋🤙💅👀👁️🧠🫀🫁👄👶🧒👦👧🧑👨👩🧔👨‍🦱👩‍🦱👨‍🦰👩‍🦰👨‍🦳👩‍🦳👨‍🦲👩‍🦲🧑‍💻🧑‍🎤🧑‍🎨🧑‍🚀🧑‍🍳🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦄🐝🦋🐌🐞🐢🐍🦎🦖🐙🦀🐠🐟🐬🐳🦈🐊🐘🦒🦓🦍🐪🐫🦘🦬🍓"));
  const ep=/\p{Extended_Pictographic}/u;
  const ranges=[[0x1F300,0x1FAFF],[0x2600,0x27BF],[0x2300,0x23FF],[0x2B00,0x2BFF]];
  try{for(const [a,b] of ranges)for(let cp=a;cp<=b;cp++){const ch=String.fromCodePoint(cp);if(ep.test(ch))set.add(ch)}}catch(_){}
  const seed=[...set].filter(x=>x.length<=2).slice(0,700),tones=["🏻","🏼","🏽","🏾","🏿"];
  seed.forEach(e=>tones.forEach(t=>set.add(e+t)));
  for(let a=0x1F1E6;a<=0x1F1FF;a++)for(let b=0x1F1E6;b<=0x1F1FF;b++)set.add(String.fromCodePoint(a,b));
  for(let n=0;n<=9;n++)set.add(n+"️⃣");
  buildEmojiBank.cache=[...set];return buildEmojiBank.cache;
}
function renderEmojiGrid(){
  const grid=document.getElementById("emojiGrid"),q=document.getElementById("emojiSearch")?.value.trim().toLowerCase()||"",bank=buildEmojiBank();
  const filtered=q?bank.filter(e=>e.includes(q)):bank,slice=filtered.slice(0,state.emojiOffset+240),show= slice;
  grid.innerHTML=show.map(e=>"<button class='emoji-choice' type='button' data-emoji='"+esc(e)+"' title='Emoji'>"+e+"</button>").join("");
  document.getElementById("emojiMore").hidden=show.length>=filtered.length;
  grid.scrollTop=grid.scrollHeight;
  grid.querySelectorAll("[data-emoji]").forEach(b=>b.onclick=()=>insertEmoji(b.dataset.emoji));
}
function insertEmoji(emoji){
  const input=document.getElementById("commentInput");if(!input)return;const a=input.selectionStart??input.value.length,b=input.selectionEnd??input.value.length;
  input.value=input.value.slice(0,a)+emoji+input.value.slice(b);input.focus();input.selectionStart=input.selectionEnd=a+emoji.length;toggleEmoji(false);
}

function loadRemoteComments(){
  try{
    const q=query(collection(db,"feedComments"),orderBy("createdAt","asc"),limit(500));
    stopRemoteComments=onSnapshot(q,snap=>{
      snap.forEach(s=>{const x=s.data(),post=x.postId;if(!post)return;if(!Array.isArray(state.comments[post]))state.comments[post]=[];const found=state.comments[post].find(c=>c.id===s.id||c.remoteId===s.id);const normalized={id:s.id,remoteId:s.id,postId:post,uid:x.uid||"",authorName:x.authorName||"Member",authorPhotoURL:x.authorPhotoURL||"",text:x.text||"",parentId:x.parentId||null,photoData:x.photoData||"",edited:x.edited===true,createdAt:x.createdAt||0};if(found)Object.assign(found,normalized);else state.comments[post].push(normalized)});
      if(state.currentCommentId)renderComments(state.currentCommentId);
    },e=>console.warn("[Feeds] feedComments unavailable",e));
  }catch(e){console.warn(e)}
}
function loadRemoteReactions(){
  try{
    const q=query(collection(db,"feedReactions"),limit(1000));
    stopRemoteReactions=onSnapshot(q,snap=>{
      const remoteTouched=new Set();
      snap.forEach(s=>{const x=s.data();if(x.postId)remoteTouched.add(x.postId)});
      remoteTouched.forEach(postId=>{state.reactions[postId]={};for(const k of REACTION_KEYS)state.reactions[postId][k]=[]});
      snap.forEach(s=>{const x=s.data();if(!x.postId||!x.uid||!REACTIONS[x.reaction])return;const d=reactionData(x.postId);if(!d[x.reaction].includes(x.uid))d[x.reaction].push(x.uid)});
      writeLocal("tubalhub-feed-reactions",state.reactions);renderFeed(true);
    },e=>console.warn("[Feeds] feedReactions unavailable",e));
  }catch(e){console.warn(e)}
}
function setupHubContent(){
  try{stopHub=subscribeHubPosts(items=>{state.hubPosts=items;buildFeed()})}catch(e){console.warn("[Feeds] hub content unavailable",e)}
}
function setupPresence(){
  try{
    onSnapshot(query(collection(db,"presence"),limit(200)),snap=>{state.presence.clear();snap.forEach(s=>{const x=s.data();if(x.uid)state.presence.set(x.uid,{uid:x.uid,...x})});renderContacts();updateAvatarStatus();renderActiveGames();renderSuggested()},e=>console.warn("[Feeds] presence unavailable",e))
  }catch(e){console.warn(e)}
}
function setupUI(){
  if(uiReady)return;uiReady=true;
  document.body.addEventListener("pointermove",e=>{document.body.style.setProperty("--mx",e.clientX+"px");document.body.style.setProperty("--my",e.clientY+"px");const card=e.target.closest(".post-card,.feeds-panel,.feed-toolbar");if(card){const r=card.getBoundingClientRect();card.style.setProperty("--card-mx",((e.clientX-r.left)/Math.max(1,r.width)*100)+"%");card.style.setProperty("--card-my",((e.clientY-r.top)/Math.max(1,r.height)*100)+"%")}}, {passive:true});
  document.querySelectorAll(".feed-filter").forEach(b=>b.addEventListener("click",()=>{state.savedMode=false;state.filter=b.dataset.filter||"all";document.querySelectorAll(".feed-filter").forEach(x=>x.classList.toggle("active",x===b));renderFeed(true)}));
  document.getElementById("feedSearch")?.addEventListener("input",e=>{state.query=e.target.value;renderFeed(true)});
  document.getElementById("feedSort")?.addEventListener("change",e=>{state.sort=e.target.value;renderFeed(true)});
  document.getElementById("createPostTrigger")?.addEventListener("click",openPostModal);
  document.getElementById("liveAction")?.addEventListener("click",()=>location.href="live.html");
  document.getElementById("photoAction")?.addEventListener("click",openPostModal);
  document.getElementById("productAction")?.addEventListener("click",()=>location.href="shop.html");
  document.getElementById("postForm")?.addEventListener("submit",publishPost);
  document.getElementById("cancelPost")?.addEventListener("click",closePostModal);
  document.getElementById("cancelPostX")?.addEventListener("click",closePostModal);
  document.getElementById("postAttach")?.addEventListener("click",()=>document.getElementById("postImageInput")?.click());
  document.getElementById("postImageInput")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(!f)return;state.postFile=f;document.getElementById("postFileName").textContent=f.name;filePreview(f,"postPreview")});
  document.getElementById("shareBackdrop")?.addEventListener("click",closeShareModal);
  document.getElementById("closeShare")?.addEventListener("click",closeShareModal);
  document.querySelectorAll("[data-share]").forEach(b=>b.addEventListener("click",()=>shareTo(b.dataset.share)));
  document.getElementById("copyShare")?.addEventListener("click",()=>{shareTo("copy")});
  document.getElementById("nativeShare")?.addEventListener("click",nativeShare);
  document.getElementById("shareToHub")?.addEventListener("click",shareToHub);
  if(!navigator.share){const b=document.getElementById("nativeShare");if(b)b.hidden=true}
  document.getElementById("closeComments")?.addEventListener("click",closeComments);
  document.getElementById("commentInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addComment()}});
  document.getElementById("sendComment")?.addEventListener("click",e=>{e.preventDefault();addComment()});
  document.getElementById("emojiButton")?.addEventListener("click",()=>toggleEmoji(true));
  document.getElementById("emojiSearch")?.addEventListener("input",()=>{state.emojiOffset=0;renderEmojiGrid()});
  document.getElementById("emojiMore")?.addEventListener("click",()=>{state.emojiOffset+=240;renderEmojiGrid()});
  document.getElementById("commentPhotoButton")?.addEventListener("click",()=>{const i=document.getElementById("commentPhotoInput");i.accept="image/*";i.click()});
  document.getElementById("commentGifButton")?.addEventListener("click",()=>{const i=document.getElementById("commentPhotoInput");i.accept="image/gif";i.click()});
  document.getElementById("commentStickerButton")?.addEventListener("click",()=>toggleEmoji(true));
  document.getElementById("commentPhotoInput")?.addEventListener("change",e=>attachCommentPhoto(e.target.files?.[0]));
  document.getElementById("confirmDelete")?.addEventListener("click",deleteComment);
  document.querySelectorAll("[data-close-modal]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.closeModal).hidden=true));
  document.getElementById("reactionWhoModal")?.addEventListener("click",e=>{if(e.target.id==="reactionWhoModal")e.currentTarget.hidden=true});
  document.getElementById("postModal")?.addEventListener("click",e=>{if(e.target.id==="postModal")closePostModal()});
  document.getElementById("commentModal")?.addEventListener("click",e=>{if(e.target.id==="commentModal")closeComments()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeReactionPicker();closeShareModal();if(!document.getElementById("commentModal").hidden)closeComments()}});
  document.getElementById("savedMenu")?.addEventListener("click",()=>{state.savedMode=true;state.filter="all";document.querySelectorAll(".feed-filter").forEach(x=>x.classList.remove("active"));renderFeed(true)});
  const sentinel=document.getElementById("feedSentinel");if(sentinel&&"IntersectionObserver" in window){const observer=new IntersectionObserver(en=>{if(!en[0].isIntersecting||state.loading)return;if(state.page<Math.ceil(visible().length/state.pageSize))renderFeed(false)},{rootMargin:"700px 0px"});observer.observe(sentinel)}
  setupTyping();
}
onAuthStateChanged(auth,async user=>{
  state.auth=user&&!user.isAnonymous?user:null;
  setupUI();updateAvatarStatus();renderStories();buildFeed();
  await Promise.all([loadPeople(),loadProducts()]);
  setupPresence();setupHubContent();loadRemoteComments();loadRemoteReactions();
  buildFeed();updateAvatarStatus();
});
