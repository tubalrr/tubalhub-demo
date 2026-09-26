import {getFirestore,collection,onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {app} from "./firebase-config.js";
const db=getFirestore(app);
const LOGO_BASE="https://commons.wikimedia.org/wiki/Special:Redirect/file/";
async function loadCtrlzoneGames(){
  try{
    const res=await fetch("../data/games.json?ctrlzone="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error("games.json "+res.status);
    const data=await res.json();
    const rows=Array.isArray(data)?data:(Array.isArray(data?.games)?data.games:[]);
    return rows.filter(g=>g&&g.id&&(g.title||g.name)).map(g=>({
      ...g,
      name:String(g.name||g.title),
      short:String(g.short||g.id).toUpperCase(),
      genre:String(g.genre||g.category||"Game"),
      dev:String(g.dev||""),
      description:String(g.description||""),
      officialUrl:String(g.officialUrl||"")
    }));
  }catch(err){
    console.error("[CTRLZONE catalog] failed to load shared games.json",err);
    return [];
  }
}
const games=await loadCtrlzoneGames();
const state={genre:"All",query:"",favorites:new Set(),featuredId:"mlbb",liveMembers:0,featuredTimer:null,featuredIndex:0};
const els={
  grid:document.getElementById("gamesGrid"),filters:document.getElementById("genreFilters"),search:document.getElementById("gameSearch"),
  count:document.getElementById("gameCount"),empty:document.getElementById("gameEmpty"),featuredTrack:document.getElementById("featuredTrack"),featuredStage:document.getElementById("featuredStage"),featuredPrev:document.getElementById("featuredPrev"),featuredNext:document.getElementById("featuredNext"),featuredDots:document.getElementById("featuredDots"),
  toast:document.getElementById("ctrlToast"),particles:document.getElementById("ctrlParticles")
};

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const genres=["All","MOBA","Sandbox","Action","FPS","Battle Royale"];
function readFavs(){try{const raw=JSON.parse(localStorage.getItem("ctrlzone-favorites")||"[]");state.favorites=new Set(Array.isArray(raw)?raw:[])}catch(_){state.favorites=new Set()}}
function saveFavs(){try{localStorage.setItem("ctrlzone-favorites",JSON.stringify([...state.favorites]))}catch(_){}}
function notify(msg){els.toast.textContent=msg;els.toast.classList.add("open");clearTimeout(notify.t);notify.t=setTimeout(()=>els.toast.classList.remove("open"),2200)}
function burstAt(el,count=6){
  if(!el)return;
  const r=el.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const p=document.createElement("i");p.className="ctrl-particle";
    p.style.left=(r.left+r.width/2)+"px";p.style.top=(r.top+r.height/2)+"px";
    p.style.background=i%2?"#7d5aff":"#1dff91";
    const a=(Math.PI*2/count)*i;const d=20+Math.random()*22;
    p.style.setProperty("--dx",Math.cos(a)*d+"px");p.style.setProperty("--dy",Math.sin(a)*d+"px");
    els.particles.appendChild(p);setTimeout(()=>p.remove(),650)
  }
}
function updateLiveUI(count){
  state.liveMembers=count;
  const header=document.getElementById("headerLivePlayers");
  const featured=document.getElementById("featuredLiveCount");
  const copy=document.getElementById("featuredMemberCopy");
  const dot=document.querySelector(".ctrl-header-live .live-dot");
  if(header)header.textContent=String(count);
  updateFeaturedLiveUI();
  dot?.classList.toggle("is-offline",count===0);
}
function initRealPresence(){
  onSnapshot(collection(db,"presence"),snap=>{
    const cutoff=Date.now()-45000;
    let count=0;
    snap.forEach(x=>{
      const d=x.data();
      const seen=d.lastSeen?.toMillis?.();
      if(d.online===true&&seen&&seen>=cutoff)count++;
    });
    updateLiveUI(count);
  },err=>{
    console.warn("[CTRLZONE presence]",err);
    const h=document.getElementById("headerLivePlayers");
    const f=document.getElementById("featuredLiveCount");
    const c=document.getElementById("featuredMemberCopy");
    if(h)h.textContent="—";
    if(f)f.textContent="—";
    if(c)c.textContent="Live member count unavailable.";
  });
}
function renderFilters(){
  const counts=Object.fromEntries(genres.map(g=>[g,g==="All"?games.length:games.filter(x=>x.genre===g).length]));
  els.filters.innerHTML=genres.map(g=>'<button class="genre-filter '+(state.genre===g?"active":"")+'" data-genre="'+esc(g)+'" role="tab" aria-selected="'+(state.genre===g?'true':'false')+'">'+esc(g)+' <span>'+counts[g]+'</span></button>').join("");
}
function filteredGames(){
  const q=state.query.trim().toLowerCase();
  return games.filter(g=>(state.genre==="All"||g.genre===state.genre)&&(!q||g.name.toLowerCase().includes(q)||g.dev.toLowerCase().includes(q)));
}
function logoMarkup(g,center=false){
  return '<span class="logo-wrap '+(center?"game-logo-center":"game-mini-logo")+'"><span class="logo-skeleton"></span><img src="'+esc(g.logo)+'" alt="'+esc(g.name)+' official logo" loading="lazy"></span>'
}
function cardMarkup(g,i){
  return '<article class="game-card spotlight-card" data-game-id="'+esc(g.id)+'" style="--stagger:'+(i*.06)+'s">'+
    '<div class="game-cover"><img class="cover-image" src="'+esc(g.cover)+'" alt="'+esc(g.name)+' game cover" loading="lazy"><span class="official-badge">Official ✓</span><span class="genre-badge">'+esc(g.genre)+'</span>'+logoMarkup(g,true)+'</div>'+
    '<button class="favorite-btn '+(state.favorites.has(g.id)?"active":"")+'" data-favorite="'+esc(g.id)+'" type="button" aria-label="'+(state.favorites.has(g.id)?"Remove":"Add")+' '+esc(g.name)+' favorite">'+(state.favorites.has(g.id)?"♥":"♡")+'</button>'+
    '<div class="game-body"><div class="game-body-top">'+logoMarkup(g,false)+'<div class="game-meta"><h3 class="game-title">'+esc(g.name)+'</h3><div class="game-dev">'+esc(g.dev)+'</div></div></div>'+
    '<p class="game-desc">'+esc(g.description)+'</p><div class="game-stats"><span class="game-stat">✓ <strong>Official listing</strong></span><span class="game-stat">'+esc(g.genre)+'</span></div>'+
    '<div class="game-actions"><button class="game-action play-official" data-play="'+esc(g.id)+'" type="button">Play Official</button><button class="game-action visit-site" data-visit="'+esc(g.id)+'" type="button">Visit Website</button><button class="game-action share-game" data-share="'+esc(g.id)+'" type="button" aria-label="Share '+esc(g.name)+'">•••</button></div></div></article>';
}
function renderGames(){
  const list=filteredGames();els.count.textContent=list.length+" game"+(list.length===1?"":"s");
  els.empty.hidden=Boolean(list.length);
  els.grid.innerHTML=list.map(cardMarkup).join("");
  wireLogoLoading();wireSpotlights();
}
function wireLogoLoading(){
  els.grid.querySelectorAll(".logo-wrap img").forEach(img=>{
    const wrap=img.closest(".logo-wrap");const done=()=>wrap?.classList.add("logo-ready");
    if(img.complete){done()}else{img.addEventListener("load",done,{once:true});img.addEventListener("error",()=>{img.alt="";done();const acronym=img.closest(".game-logo-center")?null:""} ,{once:true})}
  });
}
function wireSpotlights(){
  document.querySelectorAll(".spotlight-card").forEach(card=>{
    card.addEventListener("pointermove",e=>{
      const r=card.getBoundingClientRect();card.style.setProperty("--mx",(e.clientX-r.left)+"px");card.style.setProperty("--my",(e.clientY-r.top)+"px")
    },{passive:true})
  })
}
function featuredIndex(){return state.featuredIndex}
function renderFeaturedDots(){
  if(!els.featuredDots)return;
  els.featuredDots.innerHTML=games.map((g,i)=>'<button class="'+(i===featuredIndex()?"active":"")+'" data-feature-dot="'+i+'" type="button" aria-label="Show '+esc(g.name)+'"></button>').join("");
}
function featuredSlideMarkup(g){
  return '<article class="featured-card spotlight-card">'+
    '<div class="featured-cover"><img src="'+esc(g.cover)+'" alt="'+esc(g.name)+' featured cover"></div>'+
    '<div class="featured-copy"><img class="feature-logo" src="'+esc(g.logo)+'" alt="'+esc(g.name)+' official logo">'+
    '<div class="featured-live"><span class="mini-online-dot"></span> TUBAL HUB LIVE • <strong data-featured-live-count>…</strong> MEMBERS</div>'+
    '<h3>'+esc(g.name)+'</h3><p class="featured-desc">'+esc(g.description)+'</p>'+
    '<div class="featured-members" aria-live="polite"><span data-featured-live-copy>Checking live members…</span></div>'+
    '<div class="featured-actions"><button class="join-party" data-featured-play="'+esc(g.id)+'" type="button">Join Party →</button><button class="watch-stream" data-featured-stream="'+esc(g.id)+'" type="button">Watch Stream</button></div></div>'+
  '</article>';
}
function renderFeatured(){
  if(!els.featuredTrack)return;
  state.featuredIndex=Math.max(0,games.findIndex(x=>x.id===state.featuredId));
  els.featuredTrack.innerHTML=games.map(featuredSlideMarkup).join("");
  updateFeaturedLiveUI();
  updateFeaturedPosition(false);
  renderFeaturedDots();
  els.featuredTrack.querySelectorAll(".spotlight-card").forEach(card=>{
    card.addEventListener("pointermove",e=>{
      const r=card.getBoundingClientRect();
      card.style.setProperty("--mx",(e.clientX-r.left)+"px");
      card.style.setProperty("--my",(e.clientY-r.top)+"px");
    },{passive:true});
  });
}
function updateFeaturedLiveUI(){
  els.featuredTrack?.querySelectorAll("[data-featured-live-count]").forEach(x=>x.textContent=String(state.liveMembers));
  els.featuredTrack?.querySelectorAll("[data-featured-live-copy]").forEach(x=>x.textContent=state.liveMembers===1?"1 member is online now.":state.liveMembers+" members are online now.");
}
function updateFeaturedPosition(animate=true){
  if(!els.featuredTrack)return;
  els.featuredTrack.style.transition=animate?"transform .55s cubic-bezier(.16,1,.3,1)":"none";
  els.featuredTrack.style.transform="translate3d(-"+(state.featuredIndex*100)+"%,0,0)";
  state.featuredId=games[state.featuredIndex].id;
  renderFeaturedDots();
}
function slideFeatured(direction=1){
  const next=(state.featuredIndex+direction+games.length)%games.length;
  state.featuredIndex=next;
  updateFeaturedPosition(true);
}
function startFeaturedAuto(){
  clearInterval(state.featuredTimer);
  state.featuredTimer=setInterval(()=>slideFeatured(1),6500);
}
function stopFeaturedAuto(){clearInterval(state.featuredTimer);state.featuredTimer=null}
function playGame(g,button){
  burstAt(button,6);button.classList.remove("is-pop");void button.offsetWidth;button.classList.add("is-pop");
  notify("Opening "+g.name+" official website…");window.open(g.officialUrl,"_blank","noopener,noreferrer")
}
function debounce(fn,delay){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay)}}
async function shareGame(g,button){
  const url=g.officialUrl;
  if(navigator.share){try{await navigator.share({title:g.name,text:"Check out "+g.name+" in CTRLZONE.",url});notify("Share sheet opened")}catch(_){}}
  else{try{await navigator.clipboard.writeText(url);notify("Official link copied")}catch(_){notify("Official link: "+url)}}
  burstAt(button,6);
}

els.filters.addEventListener("click",e=>{
  const b=e.target.closest("[data-genre]");if(!b)return;state.genre=b.dataset.genre;renderFilters();renderGames()
});
els.search.addEventListener("input",debounce(()=>{state.query=els.search.value;renderGames()},200));
document.getElementById("featuredPrev")?.addEventListener("click",()=>{stopFeaturedAuto();slideFeatured(-1);startFeaturedAuto()});
document.getElementById("featuredNext")?.addEventListener("click",()=>{stopFeaturedAuto();slideFeatured(1);startFeaturedAuto()});
els.featuredDots?.addEventListener("click",e=>{
  const dot=e.target.closest?.("[data-feature-dot]");if(!dot)return;
  stopFeaturedAuto();
  const target=Number(dot.dataset.featureDot);if(!Number.isInteger(target))return;
  state.featuredIndex=((target%games.length)+games.length)%games.length;
  updateFeaturedPosition(true);
  startFeaturedAuto();
});
els.featuredStage?.addEventListener("mouseenter",stopFeaturedAuto);
els.featuredStage?.addEventListener("mouseleave",startFeaturedAuto);

document.addEventListener("click",e=>{
  const fav=e.target.closest?.("[data-favorite]");if(fav){const id=fav.dataset.favorite;if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);saveFavs();const active=state.favorites.has(id);fav.classList.toggle("active",active);fav.textContent=active?"♥":"♡";burstAt(fav,6);notify(active?"Added to favorites":"Removed from favorites");return}
  const play=e.target.closest?.("[data-play]");if(play){const g=games.find(x=>x.id===play.dataset.play);if(g)playGame(g,play);return}
  const visit=e.target.closest?.("[data-visit]");if(visit){const g=games.find(x=>x.id===visit.dataset.visit);if(g){notify("Opening "+g.name+" website…");window.open(g.officialUrl,"_blank","noopener,noreferrer")}return}
  const share=e.target.closest?.("[data-share]");if(share){const g=games.find(x=>x.id===share.dataset.share);if(g)shareGame(g,share);return}
  const fplay=e.target.closest?.("[data-featured-play]");if(fplay){const g=games.find(x=>x.id===fplay.dataset.featuredPlay);if(g)playGame(g,fplay);return}
  const stream=e.target.closest?.("[data-featured-stream]");if(stream){const g=games.find(x=>x.id===stream.dataset.featuredStream);if(g){notify("Stream hub ready for "+g.name);document.getElementById("games")?.scrollIntoView({behavior:"smooth",block:"start"})}}
});
document.getElementById("playNowBtn")?.addEventListener("click",()=>{
  const g=games.find(x=>x.id===state.featuredId)||games[0];const b=document.getElementById("playNowBtn");playGame(g,b);
});

readFavs();const sg=document.getElementById("statGameCount");if(sg)sg.textContent=String(games.length);const sn=document.getElementById("statGenreCount");if(sn)sn.textContent=String(new Set(games.map(g=>g.genre)).size);const so=document.getElementById("statOfficialCount");if(so)so.textContent=String(games.filter(g=>g.officialUrl).length);renderFilters();renderFeatured();initRealPresence();startFeaturedAuto();
els.grid.innerHTML=Array.from({length:8},(_,i)=>'<div class="game-card" style="--stagger:'+(i*.06)+'s"><div class="game-cover"><span class="logo-skeleton" style="inset:0"></span></div><div class="game-body"><div class="game-body-top"><span class="game-mini-logo"><span class="logo-skeleton"></span></span><div class="game-meta"><div style="height:18px;width:68%;border-radius:7px;background:rgba(255,255,255,.06)"></div><div style="height:9px;width:35%;margin-top:8px;border-radius:5px;background:rgba(255,255,255,.04)"></div></div></div><div style="height:10px;width:92%;margin-top:15px;border-radius:5px;background:rgba(255,255,255,.04)"></div><div style="height:10px;width:68%;margin-top:7px;border-radius:5px;background:rgba(255,255,255,.04)"></div></div></div>').join("");
setTimeout(renderGames,650);

