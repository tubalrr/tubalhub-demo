
import {getFirestore,collection,getDocs,query,orderBy,limit,onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {subscribeHubPosts} from "./hub-content.js";
import {app} from "./firebase-config.js";
const db=getFirestore(app);

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const readJson=(k,f)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch(_){return f}};
const saveJson=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
const initials=n=>(String(n||"TUBAL HUB").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"TH");
const imageOf=x=>x.imageUrl||x.coverUrl||x.image||x.mediaUrl||x.thumbnailUrl||"";
const titleOf=x=>x.title||"Untitled article";
const textOf=x=>x.excerpt||x.text||x.summary||x.description||"";
const dateOf=x=>x.createdAt?.toDate?x.createdAt.toDate():x.createdAt?.seconds?new Date(x.createdAt.seconds*1000):typeof x.createdAt==="number"?new Date(x.createdAt):x.date?new Date(x.date):null;
const dateLabel=x=>{const d=dateOf(x);return d&&!Number.isNaN(d.getTime())?d.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"}):String(x.date||"Latest")};
const timeLabel=x=>{const d=dateOf(x);return d&&!Number.isNaN(d.getTime())?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):""};
const minutesToRead=x=>{if(x.readingTime)return String(x.readingTime).toLowerCase().includes("min")?x.readingTime:String(x.readingTime)+" min read";const words=String(x.body||x.text||x.excerpt||"").trim().split(/\s+/).filter(Boolean).length;return words?Math.max(1,Math.ceil(words/220))+" min read":""};
const categoryOf=x=>{const hay=String(x.category||x.type||"")+" "+titleOf(x)+" "+textOf(x);const s=hay.toLowerCase();if(/gaming|game|esports|mlbb|mobile legends|honor of kings/.test(s))return"gaming";if(/story|stories|feature|creator/.test(s))return"stories";if(/event|events|session|tournament/.test(s))return"events";if(/tech|technology|app|software|ai/.test(s))return"tech";if(/community|member|chat|hub/.test(s))return"community";return"platform"};
const categoryLabel=k=>({gaming:"Gaming",community:"Community",stories:"Stories",events:"Events",tech:"Tech",platform:"Platform"}[k]||"News");
const authorName=x=>x.authorName||x.authorDisplayName||x.displayName||x.author||"TUBAL HUB";
const authorPhoto=x=>x.authorPhotoURL||x.authorPhoto||x.authorAvatar||"";
const authorOnline=x=>x.authorOnline===true||x.online===true;
const metrics=x=>{const b=[];if(x.views!==undefined&&x.views!==null&&x.views!=="")b.push(String(x.views));if(x.commentsCount!==undefined&&x.commentsCount!==null)b.push(String(x.commentsCount)+" comments");return b};
const state={all:[],sourceNews:[],hubNews:[],filter:"all",query:"",current:null,bookmarks:new Set(readJson("tubalhub-news-bookmarks",[]))};

function avatarHtml(x,big){const src=authorPhoto(x);return src?"<span class='"+(big?"news-avatar":"news-mini-avatar")+"'><img src='"+esc(src)+"' alt=''></span>":"<span class='"+(big?"news-avatar":"news-mini-avatar")+"'>"+esc(initials(authorName(x)))+"</span>"}
function mediaHtml(x,featured){const src=imageOf(x);if(src)return "<img class='"+(featured?"news-featured-media":"news-card-media-image")+"' src='"+esc(src)+"' alt='' loading='"+(featured?"eager":"lazy")+"'>";const icon={gaming:"🎮",community:"◉",stories:"✦",events:"◈",tech:"⌁",platform:"▣"}[categoryOf(x)]||"📰";return "<div class='"+(featured?"news-featured-fallback":"news-card-fallback")+"'>"+icon+"</div>"}
function featuredItem(){return state.all.find(x=>x.featured===true||x.isFeatured===true||x.editorPick===true)||state.all[0]||null}
function filtered(){return state.all.filter(x=>(state.filter==="all"||categoryOf(x)===state.filter)&&(!state.query||(titleOf(x)+" "+textOf(x)+" "+authorName(x)).toLowerCase().includes(state.query.trim().toLowerCase())))}

function renderTicker(){
  const box=document.getElementById("newsTicker"),track=document.getElementById("newsTickerTrack");if(!box||!track)return;
  const arr=state.all.slice(0,6);if(!arr.length){box.hidden=true;return}
  const one=arr.map(x=>"<span class='news-ticker-item'><b>"+esc(categoryLabel(categoryOf(x)))+"</b> • "+esc(titleOf(x))+"</span>").join("");
  track.innerHTML=one+one;box.hidden=false;
}

function renderFeatured(){
  const slot=document.getElementById("newsFeaturedSlot");if(!slot)return;const x=featuredItem();
  if(!x){slot.innerHTML="<div class='news-empty'><div><div class='news-empty-icon'>📰</div><h3>No news yet</h3><p>There are no published articles yet.</p></div></div>";return}
  const meta=[minutesToRead(x),dateLabel(x)].filter(Boolean).join(" · ");
  slot.innerHTML="<article class='news-featured-card' data-open='"+esc(x.id)+"'>"+mediaHtml(x,true)+"<div class='news-featured-overlay'></div><div class='news-featured-content'><span class='news-category-pill'>"+esc(categoryLabel(categoryOf(x)))+"</span><h2 class='news-featured-title'>"+esc(titleOf(x))+"</h2><p class='news-featured-excerpt'>"+esc(textOf(x))+"</p><div class='news-author-row'>"+avatarHtml(x,true)+"<div><div class='news-author-main'>"+esc(authorName(x))+" <span class='news-author-online "+(authorOnline(x)?"":"offline")+"'></span></div><div class='news-author-meta'>"+esc(meta)+"</div></div></div></div></article>";
  slot.querySelector("[data-open]")?.addEventListener("click",()=>openReader(x));
}

function renderGrid(list){
  const grid=document.getElementById("newsGrid"),count=document.getElementById("newsResultCount");if(!grid)return;
  if(count)count.textContent=list.length?(list.length+" "+(list.length===1?"story":"stories")):"";
  if(!state.all.length){grid.innerHTML="<div class='news-empty'><div><div class='news-empty-icon'>📰</div><h3>No news yet</h3><p>Published stories will appear here.</p></div></div>";return}
  if(!list.length){grid.innerHTML="<div class='news-empty'><div><div class='news-empty-icon'>⌕</div><h3>No matching news</h3><p>Try another category or search phrase.</p></div></div>";return}
  grid.innerHTML=list.map((x,i)=>{
    const stats=metrics(x),saved=state.bookmarks.has(x.id);
    return "<article class='news-card' data-open='"+esc(x.id)+"' style='animation-delay:"+(Math.min(i,14)*.06)+"s'><div class='news-card-media'>"+mediaHtml(x,false)+"<span class='news-card-category'>"+esc(categoryLabel(categoryOf(x)))+"</span><button class='news-bookmark "+(saved?"saved":"")+"' data-bookmark='"+esc(x.id)+"' type='button' aria-label='"+(saved?"Remove bookmark":"Bookmark")+"'>"+(saved?"★":"☆")+"</button></div><div class='news-card-content'><h3 class='news-card-title'>"+esc(titleOf(x))+"</h3><p class='news-card-excerpt'>"+esc(textOf(x))+"</p><div class='news-card-footer'><div class='news-card-author'>"+avatarHtml(x,false)+"<div class='news-byline'><b>"+esc(authorName(x))+"</b><span>"+esc(dateLabel(x))+"</span></div></div><div class='news-card-metrics'>"+stats.map(s=>"<span>"+esc(s)+"</span>").join("")+"<span class='news-reactions'><button type='button' class='news-react' data-react='😀' aria-label='React'>😀</button><button type='button' class='news-react' data-react='❤️' aria-label='React with heart'>❤️</button></span></div></div></div></article>"
  }).join("");
  grid.querySelectorAll("[data-open]").forEach(card=>card.addEventListener("click",e=>{if(e.target.closest("[data-bookmark]"))return;const x=state.all.find(y=>y.id===card.dataset.open);if(x)openReader(x)}));
  grid.querySelectorAll("[data-bookmark]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const id=btn.dataset.bookmark;if(state.bookmarks.has(id))state.bookmarks.delete(id);else state.bookmarks.add(id);saveJson("tubalhub-news-bookmarks",[...state.bookmarks]);btn.classList.remove("is-pop");void btn.offsetWidth;btn.classList.add("is-pop");setTimeout(()=>btn.classList.remove("is-pop"),420);renderGrid(filtered())}));
  grid.querySelectorAll(".news-react").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();btn.classList.remove("is-pop");void btn.offsetWidth;btn.classList.add("is-pop");const burst=document.createElement("span");burst.className="news-react-burst";for(let i=0;i<6;i++){const p=document.createElement("i");p.style.setProperty("--a",(i*60)+"deg");burst.appendChild(p)}btn.appendChild(burst);setTimeout(()=>burst.remove(),600);setTimeout(()=>btn.classList.remove("is-pop"),450)}));
}

function renderTrending(){
  const box=document.getElementById("trendingList");if(!box)return;
  const list=[...state.all].sort((a,b)=>Number(b.views||0)-Number(a.views||0)||(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0)).slice(0,5);
  box.innerHTML=list.length?list.map((x,i)=>"<div class='trending-row'><span class='trending-num'>"+String(i+1).padStart(2,"0")+"</span><a href='#' data-trend='"+esc(x.id)+"'>"+esc(titleOf(x))+"</a></div>").join(""):"<div class='news-side-copy'><p>No trending stories yet.</p></div>";
  box.querySelectorAll("[data-trend]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();const x=state.all.find(y=>y.id===a.dataset.trend);if(x)openReader(x)}));
}
function renderRelated(){
  const list=state.all.filter(x=>x.id!==state.current?.id).slice(0,3);
  const renderBox=box=>{
    if(!box)return;
    box.innerHTML=list.length?list.map(x=>"<article class='news-card' data-related='"+esc(x.id)+"'><div class='news-card-media'>"+mediaHtml(x,false)+"<span class='news-card-category'>"+esc(categoryLabel(categoryOf(x)))+"</span></div><div class='news-card-content'><h3 class='news-card-title'>"+esc(titleOf(x))+"</h3><p class='news-card-excerpt'>"+esc(textOf(x))+"</p></div></article>").join(""):"<div class='news-empty'><div><div class='news-empty-icon'>✦</div><h3>No related articles</h3><p>More published stories will appear here.</p></div></div>";
    box.querySelectorAll("[data-related]").forEach(el=>el.addEventListener("click",()=>{const item=state.all.find(y=>y.id===el.dataset.related);if(item)openReader(item)}));
  };
  renderBox(document.getElementById("relatedGrid"));
  renderBox(document.getElementById("readerRelatedGrid"));
}
function renderComments(x){
  const box=document.getElementById("newsCommentsList"),comments=Array.isArray(x.comments)?x.comments:[];
  if(!box)return;box.innerHTML=comments.length?comments.slice(0,20).map(c=>"<div class='news-comment-bubble'><b>"+esc(c.authorName||c.displayName||"Member")+"</b><div>"+esc(c.text||"")+"</div></div>").join(""):"<div class='news-comment-empty'>No comments yet.</div>"
}
function openReader(x){
  state.current=x;const r=document.getElementById("newsReader"),cover=document.getElementById("newsReaderCover"),src=imageOf(x);
  cover.hidden=!src;if(src)cover.src=src;
  document.getElementById("newsReaderCategory").textContent=categoryLabel(categoryOf(x));document.getElementById("newsReaderTitle").textContent=titleOf(x);
  document.getElementById("newsReaderByline").innerHTML=avatarHtml(x,true)+"<div><div class='news-author-main'>"+esc(authorName(x))+" <span class='news-author-online "+(authorOnline(x)?"":"offline")+"'></span></div><div class='news-author-meta'>"+esc(minutesToRead(x))+(timeLabel(x)?" · "+esc(timeLabel(x)):"")+"</div></div>";
  document.getElementById("newsReaderText").textContent=String(x.body||x.text||x.excerpt||"");renderComments(x);renderRelated();document.getElementById("newsShareSheet").hidden=true;r.hidden=false;document.body.classList.add("news-reader-open");document.getElementById("newsReaderShell").scrollTop=0
}
function closeReader(){document.getElementById("newsReader").hidden=true;document.body.classList.remove("news-reader-open")}
function setup(){
  document.body.classList.add("news-premium");
  document.querySelectorAll(".news-filter-pill").forEach(b=>b.addEventListener("click",()=>{state.filter=b.dataset.filter||"all";document.querySelectorAll(".news-filter-pill").forEach(x=>x.classList.toggle("active",x===b));renderGrid(filtered())}));
  document.getElementById("newsSearchInput")?.addEventListener("input",e=>{state.query=e.target.value;renderGrid(filtered())});
  document.getElementById("newsReaderClose")?.addEventListener("click",closeReader);
  document.getElementById("newsReader")?.addEventListener("click",e=>{if(e.target.id==="newsReader")closeReader()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeReader()});
  document.getElementById("newsReaderShell")?.addEventListener("scroll",()=>{const s=document.getElementById("newsReaderShell"),max=s.scrollHeight-s.clientHeight,ratio=max>0?s.scrollTop/max:0;document.getElementById("newsReaderProgress").style.transform="scaleX("+ratio+")"});
  document.getElementById("newsShareTrigger")?.addEventListener("click",()=>{const s=document.getElementById("newsShareSheet");if(!s)return;s.hidden=false;document.getElementById("newsShareCopy").value=location.href.split("#")[0]+"#article-"+encodeURIComponent(state.current?.id||"")});
  document.getElementById("newsShareClose")?.addEventListener("click",()=>document.getElementById("newsShareSheet").hidden=true);
  document.getElementById("newsShareCopyBtn")?.addEventListener("click",async()=>{const input=document.getElementById("newsShareCopy");try{await navigator.clipboard.writeText(input.value)}catch(_){input.select();document.execCommand("copy")}document.getElementById("newsShareCopyBtn").textContent="Copied";setTimeout(()=>document.getElementById("newsShareCopyBtn").textContent="Copy",1200)});
  document.getElementById("newsNewsletterForm")?.addEventListener("submit",e=>{e.preventDefault();const note=document.getElementById("newsNewsletterNote"),email=document.getElementById("newsNewsletterEmail")?.value.trim();if(email){note.hidden=false;note.textContent="Newsletter signup is not connected yet. Your email was not sent."}});
  document.querySelector(".news-page-shell")?.addEventListener("pointermove",e=>{const root=document.querySelector(".news-page-shell"),r=root.getBoundingClientRect();root.style.setProperty("--news-mx",(e.clientX-r.left)+"px");root.style.setProperty("--news-my",(e.clientY-r.top)+"px")},{passive:true});
}
async function load(){
  setup();
  const grid=document.getElementById("newsGrid");
  if(grid)grid.innerHTML="<div class='news-skeleton'><div class='news-skeleton-card'></div><div class='news-skeleton-card'></div><div class='news-skeleton-card'></div></div>";
  const mapNewsSnapshot=snap=>{
    state.sourceNews=snap.docs.map(d=>({id:"news-"+d.id,sourceCollection:"news",sourceId:d.id,contentType:"news",title:d.data().title||"",text:d.data().text||d.data().summary||"",description:d.data().text||d.data().summary||"",imageUrl:d.data().imageUrl||d.data().image||"",createdAt:d.data().createdAt||0,authorName:d.data().authorName||"TUBAL HUB News",category:d.data().category||"platform",articleUrl:d.data().articleUrl||""}));
  };
  const merge=()=>{
    const hub=state.hubNews.filter(x=>Array.isArray(x.destinations)?x.destinations.includes("news"):x.contentType==="news").map(x=>({...x,id:"hub-"+x.id}));
    const keys=new Set();
    state.all=[...hub,...state.sourceNews].filter(x=>{const k=x.sourceCollection&&x.sourceId?x.sourceCollection+":"+x.sourceId:x.id;if(keys.has(k))return false;keys.add(k);return true});
    state.all.sort((a,b)=>(b.createdAt?.toMillis?.()||b.createdAt?.seconds*1000||0)-(a.createdAt?.toMillis?.()||a.createdAt?.seconds*1000||0));
    renderTicker();renderFeatured();renderGrid(filtered());renderTrending();renderRelated();
  };
  try{subscribeHubPosts(items=>{state.hubNews=items;merge()})}catch(e){console.warn("[TUBAL HUB News] hubPosts",e)}
  try{
    onSnapshot(query(collection(db,"news"),orderBy("createdAt","desc"),limit(100)),snap=>{
      mapNewsSnapshot(snap);
      merge();
    },error=>console.error("[TUBAL HUB News] realtime news listener",error));
  }catch(e){
    console.warn("[TUBAL HUB News] realtime listener unavailable",e);
    try{
      const snap=await getDocs(query(collection(db,"news"),orderBy("createdAt","desc"),limit(100)));
      mapNewsSnapshot(snap);
    }catch(loadError){console.error("[TUBAL HUB News] initial load",loadError);state.sourceNews=[]}
  }
  merge();
}
load();
