
(function forceRealLayout(){
  document.body.style.overflowX='hidden';
  const main=document.getElementById('mainContent')||document.querySelector('main');
  if(main){
    main.style.marginLeft='auto';
    main.style.marginRight='auto';
    main.style.width='100%';
    main.style.maxWidth='1280px';
    main.style.left='auto';
    main.style.transform='none';
  }
})();
import { app, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { subscribeHubPosts } from "./hub-content.js";
import {
  getFirestore, collection, query, orderBy, limit, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(app);
const REAL_JOURNAL_KEY = "tubalhub_journal";
const REAL_FEED_KEY = "tubalhub_feeds";
const LEGACY_JOURNAL_KEY = "payapang-isip-journal-v1";
const JOURNAL_KEYS = [REAL_JOURNAL_KEY,LEGACY_JOURNAL_KEY,"payapang-journal"];
const FEED_KEYS = [REAL_FEED_KEY];
const SPONSORED_COLLECTION_REAL = "sponsors";
const REAL_MUSIC_DB = "tubalhub_db";
const REAL_MUSIC_STORE = "music";
const MUSIC_DB = "tubalhub-ai-music";
const MUSIC_STORE = "tracks";
const LIKES_KEY = "tubalhub_real_likes";
const PLAYS_KEY = "tubalhub_real_plays";
let livePresenceUnsubscribe=null;
let livePresenceDocs=[];
let liveHubPosts=[];
let liveHubPostsUnsubscribe=null;
let liveStatsTimer=null;

const state = {
  heroIndex:0,
  selectedMusic:null,
  musicUrl:null,
  audioContext:null,
  analyser:null,
  source:null,
  visualFrame:0,
  heroTimer:null,
  dragging:false,
  realAudioUrls:new Map()
};

const $=(s,r=document)=>r.querySelector(s);
const EMAIL_NOTIFY_CONFIG_REAL=Object.freeze({
  serviceId:window.TUBAL_EMAILJS_CONFIG?.serviceId||"",
  templateId:window.TUBAL_EMAILJS_CONFIG?.templateId||"",
  publicKey:window.TUBAL_EMAILJS_CONFIG?.publicKey||""
});
let emailJsReadyReal=false;

function initEmailJsReal(){
  if(emailJsReadyReal)return true;
  const sdk=window.emailjs;
  if(!sdk||!EMAIL_NOTIFY_CONFIG_REAL.publicKey)return false;
  try{
    sdk.init({publicKey:EMAIL_NOTIFY_CONFIG_REAL.publicKey,limitRate:{id:"tubalhub-updates",throttle:1000}});
    emailJsReadyReal=true;
    return true;
  }catch(error){
    console.warn("[TUBAL HUB EmailJS init]",error);
    return false;
  }
}

function getRealSubscribers(){
  try{
    const raw=localStorage.getItem("tubalhub_subscribers_real");
    const parsed=raw?JSON.parse(raw):[];
    if(!Array.isArray(parsed))return[];
    return parsed.filter(sub=>String(sub?.emailReal||"").trim());
  }catch(_){return[]}
}

function saveRealSubscribers(rows){
  localStorage.setItem("tubalhub_subscribers_real",JSON.stringify(rows));
}

function normalizeRealGmail(value){
  return String(value||"").trim().toLowerCase();
}

function isRealGmail(value){
  return /^[^\\s@]+@gmail\\.com$/i.test(String(value||"").trim());
}

function setSubscribeStatusReal(text,type=""){
  const el=$("#notifySubscribeStatusReal");
  if(!el)return;
  el.textContent=text;
  el.classList.toggle("is-ready",type==="ready");
  el.classList.toggle("is-error",type==="error");
}

async function sendUpdateEmailReal(sub,newVersionData){
  if(!initEmailJsReal())return {sent:false,reason:"not-configured"};
  const updatesTextReal=(Array.isArray(newVersionData?.updatesReal)?newVersionData.updatesReal:[])
    .map(u=>String(u?.typeReal||"FIX")+" - "+String(u?.scopeReal||"Site")+": "+String(u?.detailReal||"Updated"))
    .join("\\n");
  const params={
    to_email:String(sub.emailReal||""),
    to_name:String(sub.emailReal||"").split("@")[0],
    version:"v"+String(newVersionData?.version||""),
    build:String(newVersionData?.build||""),
    updates:updatesTextReal,
    phone:sub.phoneReal||"N/A",
    message:"May bagong update sa TUBAL HUB!\\n\\nVersion: v"+String(newVersionData?.version||"")+" Build "+String(newVersionData?.build||"")+"\\n\\nAnong na-update:\\n"+updatesTextReal+"\\n\\nI-load ang latest:\\nnew URL("./index.html",window.location.href).href+"?v="+encodeURIComponent(String(newVersionData?.version||""))
  };
  try{
    await window.emailjs.send(EMAIL_NOTIFY_CONFIG_REAL.serviceId,EMAIL_NOTIFY_CONFIG_REAL.templateId,params);
    return {sent:true};
  }catch(error){
    console.warn("[TUBAL HUB EmailJS send]",error);
    return {sent:false,reason:"send-failed",error};
  }
}

async function subscribeNotifyReal(){
  const emailEl=$("#notifyEmailReal");
  const phoneEl=$("#notifyPhoneReal");
  const consentEl=$("#notifyConsentReal");
  const btn=$("#subscribeNotifyRealBtn");
  const email=normalizeRealGmail(emailEl?.value);
  const phone=String(phoneEl?.value||"").trim();

  if(!isRealGmail(email)){
    setSubscribeStatusReal("Gmail required","error");
    alert("Lagay mo ang real Gmail address mo.");
    emailEl?.focus();
    return;
  }
  if(!consentEl?.checked){
    setSubscribeStatusReal("Consent required","error");
    alert("I-check muna ang consent para sa update emails.");
    consentEl?.focus();
    return;
  }

  const subs=getRealSubscribers();
  if(subs.some(s=>normalizeRealGmail(s.emailReal)===email)){
    setSubscribeStatusReal("Already subscribed","ready");
    alert("Naka-subscribe ka na real: "+email);
    return;
  }

  const record={
    emailReal:email,
    phoneReal:phone||null,
    subscribedAtReal:new Date().toISOString(),
    isReal:true,
    sourceReal:"footer subscribe",
    consentReal:true
  };

  try{
    saveRealSubscribers([...subs,record]);
  }catch(error){
    setSubscribeStatusReal("Save failed","error");
    alert("Hindi na-save ang subscription sa browser.");
    return;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent="Saving Real...";
  }
  setSubscribeStatusReal("Saved locally","ready");

  const welcomeData={
    version:"v"+String(document.getElementById("liveVersion")?.textContent||"v1.2.16").replace(/^v/i,""),
    build:String(document.getElementById("liveBuild")?.textContent||"2026-09-25_1216"),
    updates:"System update notifications enabled.",
    phone:phone||"N/A",
    message:"Welcome sa TUBAL HUB updates! Real release notifications lang ang ipapadala kapag may bagong version."
  };

  const sent=await sendUpdateEmailReal(record,{
    version:welcomeData.version.replace(/^v/i,""),
    build:welcomeData.build,
    updatesReal:[{typeReal:"FEAT",scopeReal:"Update Email",detailReal:"Na-enable ang opt-in email notifications para sa TUBAL HUB releases.",iconReal:"✉"}]
  });

  if(btn){
    btn.disabled=false;
    btn.textContent=sent.sent?"✓ Subscribed Real":"✓ Saved Real";
  }
  if(sent.sent){
    setSubscribeStatusReal("EMAIL READY","ready");
    showHomeToast("Subscribed. Welcome email sent.");
  }else{
    setSubscribeStatusReal("LOCAL ONLY","ready");
    showHomeToast("Subscription saved locally. EmailJS is not configured yet.");
  }
}

function unsubscribeNotifyReal(){
  localStorage.removeItem("tubalhub_subscribers_real");
  localStorage.removeItem("tubalhub_last_email_notify_real");
  const email=$("#notifyEmailReal");
  const phone=$("#notifyPhoneReal");
  const consent=$("#notifyConsentReal");
  if(email)email.value="";
  if(phone)phone.value="";
  if(consent)consent.checked=false;
  setSubscribeStatusReal("LOCAL","ready");
  showHomeToast("Update email subscription removed from this browser.");
}

async function notifySubscribersOnUpdateReal(newVersionData){
  const subs=getRealSubscribers();
  if(!subs.length)return;
  const version=String(newVersionData?.version||"").trim();
  if(!version)return;

  try{
    const last=safeJson(localStorage.getItem("tubalhub_last_email_notify_real"),null);
    if(last?.version===version)return;
  }catch(_){}

  if(!initEmailJsReal()){
    console.log("[TUBAL HUB update email] saved subscribers:",subs.length,"• EmailJS not configured");
    return;
  }

  let sentCount=0;
  for(const sub of subs){
    const result=await sendUpdateEmailReal(sub,newVersionData);
    if(result.sent)sentCount++;
    // EmailJS documents a 1 request/second limit; keep the client loop paced.
    await new Promise(resolve=>setTimeout(resolve,1100));
  }

  localStorage.setItem("tubalhub_last_email_notify_real",JSON.stringify({
    version,
    sentAt:new Date().toISOString(),
    count:subs.length,
    sentCount
  }));
  console.log("[TUBAL HUB update email] version:",version,"saved subscribers:",subs.length,"sent:",sentCount);
}

function initRealEmailSubscribe(){
  const btn=$("#subscribeNotifyRealBtn");
  const unsub=$("#unsubscribeNotifyRealBtn");
  if(btn&&!btn.dataset.ready){
    btn.dataset.ready="1";
    btn.addEventListener("click",subscribeNotifyReal);
  }
  if(unsub&&!unsub.dataset.ready){
    unsub.dataset.ready="1";
    unsub.addEventListener("click",unsubscribeNotifyReal);
  }
  setSubscribeStatusReal(initEmailJsReal()?"EMAIL READY":"LOCAL","ready");
}

const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const safeJson=(key,fallback=[])=>{
  try{const raw=localStorage.getItem(key);const value=raw?JSON.parse(raw):fallback;return value??fallback}catch(_){return fallback}
};
const readFirstArray=(keys)=>{
  for(const key of keys){const value=safeJson(key,null);if(Array.isArray(value)&&value.length)return value}
  return [];
};
const formatDate=value=>{
  const date=new Date(value||0);if(Number.isNaN(date.getTime()))return "Date unavailable";
  return date.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const isMobileHome=()=>window.innerWidth<=768;
const homeCardLimit=()=>isMobileHome()?4:6;


let hubMessageTimer=null;
const HUB_HERO_MESSAGES=[
  ["Three Brands. One Hub.","TUBAL HUB brings Payapang Isip, AI Music and CTRLZONE together in one central home."],
  ["Payapang Isip","A calm space for journals and personal thoughts, with your saved entries kept in your real site data."],
  ["AI Music","Explore the TUBAL HUB AI Music area, listen to available tracks and manage real audio content."],
  ["CTRLZONE","Your gaming area for the real CTRLZONE catalog, game pages and gaming-related features."],
  ["Feeds & Community","See community posts, share real content and stay connected with what is happening inside TUBAL HUB."],
  ["Shop & Profiles","Explore the Hub shop and creator/profile features while keeping the experience connected in one place."],
  ["One Connected Hub","Use the sidebar to move between Home, Feeds, Chat, Brands, Community, Shop and other TUBAL HUB features."]
];
function initSponsorMotionReal(){
  if(document.getElementById("tubalSponsorMotionReal"))return;
  const style=document.createElement("style");
  style.id="tubalSponsorMotionReal";
  style.textContent=".tubal-sponsor-card-real{position:relative;transform:translateZ(0);transition:transform .35s ease,box-shadow .35s ease}.tubal-sponsor-card-real:hover{transform:translateY(-3px) scale(1.008);box-shadow:0 14px 40px rgba(238,77,45,.18)}.tubal-sponsor-visual-real{position:relative;isolation:isolate;overflow:hidden}.tubal-sponsor-visual-real:after{content:\"\";position:absolute;inset:-20% -60%;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.28) 50%,transparent 65%);transform:translateX(-45%);animation:tubalSponsorShine 3.8s ease-in-out infinite;pointer-events:none}.tubal-sponsor-fallback-real{animation:tubalSponsorPulse 2.8s ease-in-out infinite}.tubal-sponsor-badge-real{animation:tubalSponsorFloat 2.2s ease-in-out infinite}@keyframes tubalSponsorShine{0%,55%{transform:translateX(-55%)}100%{transform:translateX(55%)}}@keyframes tubalSponsorPulse{0%,100%{filter:saturate(1);transform:scale(1)}50%{filter:saturate(1.12);transform:scale(1.012)}}@keyframes tubalSponsorFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}@media(prefers-reduced-motion:reduce){.tubal-sponsor-card-real,.tubal-sponsor-visual-real:after,.tubal-sponsor-fallback-real,.tubal-sponsor-badge-real{animation:none!important;transition:none!important}}";
  document.head.appendChild(style);
}
function initSponsorClickGuardReal(){
  if(window.__tubalSponsorClickGuardReal)return;
  window.__tubalSponsorClickGuardReal=true;
  document.addEventListener("click",event=>{
    const link=event.target?.closest?.(".tubal-sponsor-card-real");
    if(!link)return;
    const url=String(link.getAttribute("href")||"").trim();
    if(!/^https?:\/\//i.test(url))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(url);
  },true);
}
function initSponsoredReal(){
  initSponsorMotionReal();
  initSponsorClickGuardReal();
  const slots=[
    {container:"sponsoredContainerReal",content:"sponsoredContentReal",status:"sponsoredStatusReal",slot:1},
    {container:"sponsoredContainerReal2",content:"sponsoredContentReal2",status:"sponsoredStatusReal2",slot:2}
  ];
  const escAttr=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const renderEmpty=(slot,label)=>{
    const content=document.getElementById(slot.content),status=document.getElementById(slot.status);
    if(!content||!status)return;
    status.textContent="EMPTY";
    status.style.color="rgba(255,255,255,0.2)";
    status.style.background="rgba(255,255,255,0.05)";
    content.innerHTML='<div style="background:rgba(0,0,0,0.2);border-radius:12px;border:1px dashed rgba(120,255,170,0.08);display:flex;align-items:center;justify-content:center;flex-direction:column;padding:18px;text-align:center;"><span style="font-size:18px;opacity:.15;">📦</span><small style="font-size:9px;opacity:.25;margin-top:6px;">'+label+' — no active sponsor</small></div>';
  };
  const renderSlot=(slot,data)=>{
    const content=document.getElementById(slot.content),status=document.getElementById(slot.status);
    if(!content||!status)return;
    if(!data){renderEmpty(slot,"Sponsored "+slot.slot);return;}
    const title=escAttr(data.titleReal||"Sponsored");
    const desc=escAttr(data.descReal||"");
    const image=String(data.imageUrlReal||"").trim();
    const link=String(data.linkReal||"").trim();
    const safeLink=/^https?:\/\//i.test(link)?link:"";
    const imageHtml=/^https?:\/\//i.test(image)
      ? '<div class="tubal-sponsor-visual-real" style="position:relative;width:100%;height:140px;background:linear-gradient(135deg,#ee4d2d,#ff7337);display:flex;align-items:center;justify-content:center;overflow:hidden;"><div class="tubal-sponsor-fallback-real" style="color:#fff;font-weight:800;font-size:20px;letter-spacing:1px;">SHOPEE</div><img src="'+escAttr(image)+'" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;"></div>'
      : '<div class="tubal-sponsor-visual-real tubal-sponsor-fallback-real" style="height:140px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ee4d2d,#ff7337);color:#fff;font-weight:800;font-size:20px;letter-spacing:1px;">SHOPEE</div>';
    const body=imageHtml+'<div style="padding:10px;"><b style="font-size:12px;">'+title+'</b>'+(desc?'<p style="font-size:10px;opacity:.6;margin:4px 0 0;">'+desc+'</p>':"")+'</div>';
    status.textContent="LIVE";
    status.style.background="rgba(29,255,145,0.15)";
    status.style.color="#1dff91";
    content.innerHTML=safeLink
      ? '<a class="tubal-sponsor-card-real" href="'+escAttr(safeLink)+'" target="_self" rel="noopener noreferrer" aria-label="Open sponsored promotion: '+title+'" style="display:block;background:rgba(0,0,0,.3);border-radius:12px;overflow:hidden;text-decoration:none;color:#fff;border:1px solid rgba(255,215,0,.2);cursor:pointer;pointer-events:auto;position:relative;z-index:10001;touch-action:manipulation;">'+body+'</a>'
      : '<div style="display:block;background:rgba(0,0,0,.3);border-radius:12px;overflow:hidden;color:#fff;border:1px solid rgba(255,215,0,.2);">'+body+'</div>';
  };
  try{
    const q=query(collection(db,"sponsors"),limit(20));
    onSnapshot(q,snap=>{
      const active=snap.docs.map(d=>({id:d.id,...d.data()}))
        .filter(x=>x&&(x.isActive===true||String(x.isActive||"").toLowerCase()==="true")&&!(x.isExpired===true||String(x.isExpired||"").toLowerCase()==="true"))
        .sort((a,b)=>{
          const ms=v=>v?.toMillis?.()??(v?.seconds!=null?Number(v.seconds)*1000:(Date.parse(v||"")||0));
          return ms(b.updatedAt||b.createdAt)-ms(a.updatedAt||a.createdAt);
        });
      slots.forEach(slot=>{
        const item=active.find(x=>{const assigned=Number(x.sponsorSlot||0);return assigned===slot.slot||(slot.slot===1&&!assigned);});
        renderSlot(slot,item);
      });
    },err=>{
      console.warn("[TUBAL HUB Sponsors]",err);
      slots.forEach(slot=>renderEmpty(slot,"Sponsored "+slot.slot));
    });
  }catch(err){
    console.warn("[TUBAL HUB Sponsors init]",err);
    slots.forEach(slot=>renderEmpty(slot,"Sponsored "+slot.slot));
  }
}
function initHubHeroMessages(){
  const box=$("#bentoHeroMessage"),title=$("#bentoHeroMessageTitle"),textEl=$("#bentoHeroMessageText"),dots=$("#bentoHeroMessageDots");
  if(!box||!title||!textEl)return;
  clearInterval(hubMessageTimer);
  let index=0;
  if(dots)dots.innerHTML=HUB_HERO_MESSAGES.map((_,i)=>'<i class="'+(i===0?"active":"")+'"></i>').join("");
  const show=()=>{
    const item=HUB_HERO_MESSAGES[index];
    box.classList.add("is-changing");
    setTimeout(()=>{
      title.textContent=item[0];
      textEl.textContent=item[1];
      dots?.querySelectorAll("i").forEach((dot,i)=>dot.classList.toggle("active",i===index));
      box.classList.remove("is-changing");
    },560);
  };
  show();
  hubMessageTimer=setInterval(()=>{
    index=(index+1)%HUB_HERO_MESSAGES.length;
    show();
  },5000);
}

function initSpotlight(){
  if(window.matchMedia?.("(hover: none), (pointer: coarse)").matches)return;
  let frame=0,x=innerWidth/2,y=innerHeight/2;
  addEventListener("pointermove",e=>{
    x=e.clientX;y=e.clientY;if(frame)return;
    frame=requestAnimationFrame(()=>{
      document.documentElement.style.setProperty("--mx",x+"px");
      document.documentElement.style.setProperty("--my",y+"px");
      frame=0;
    });
  },{passive:true});
}

/* =========================================================
   PURE REAL DATA — browser storage for homepage content
   ========================================================= */
function parseRealArray(key){
  try{
    const raw=localStorage.getItem(key);
    const value=raw?JSON.parse(raw):[];
    return Array.isArray(value)?value:[];
  }catch(_){return []}
}
function hasFakeFlag(rows){
  return Array.isArray(rows)&&rows.some(row=>row&&(
    row.fake===true||row.mock===true||row.dummy===true||row.isFake===true||row.test===true
  ));
}
function getRealJournals(){
  const data=localStorage.getItem("tubalhub_journal");
  if(!data)return [];
  try{
    const parsed=JSON.parse(data);
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}
function migrateRealJournalStorage(){
  if(localStorage.getItem(REAL_JOURNAL_KEY))return;
  const legacy=parseRealArray(LEGACY_JOURNAL_KEY);
  if(!legacy.length)return;
  try{
    const normalized=legacy.map(entry=>({
      ...entry,
      titleReal:entry?.titleReal??entry?.title??"",
      contentReal:entry?.contentReal??entry?.text??entry?.content??entry?.body??"",
      moodEmoji:entry?.moodEmoji??entry?.mood??entry?.emoji??"",
      createdAtReal:entry?.createdAtReal??entry?.createdAt??entry?.updatedAt??0
    }));
    localStorage.setItem(REAL_JOURNAL_KEY,JSON.stringify(normalized));
  }catch(_){}
}
function normalizeRealJournal(entry,index=0){
  return {
    id:entry?.id??String(index),
    title:String(entry?.titleReal??entry?.title??"").trim(),
    content:String(entry?.contentReal??entry?.text??entry?.content??entry?.body??"").trim(),
    mood:String(entry?.moodEmoji??entry?.mood??entry?.emoji??"").trim(),
    createdAt:entry?.createdAtReal??entry?.createdAt??entry?.updatedAt??0
  };
}
function getRealJournalViews(){
  return getRealJournals().map(normalizeRealJournal).filter(entry=>entry.title||entry.content);
}
function saveRealJournal(event){
  event.preventDefault();
  const form=event.currentTarget;
  const title=String(form.elements.titleReal?.value||"").trim();
  const content=String(form.elements.contentReal?.value||"").trim();
  const moodEmoji=String(form.elements.moodEmoji?.value||"").trim();
  if(!title||!content){
    showHomeToast("Lagyan muna ng real title at journal.");
    return;
  }
  const real=getRealJournals();
  real.unshift({
    id:Date.now(),
    titleReal:title,
    contentReal:content,
    moodEmoji:moodEmoji||"🌿",
    createdAtReal:new Date().toISOString()
  });
  try{
    localStorage.setItem(REAL_JOURNAL_KEY,JSON.stringify(real.slice(0,50)));
    emitRealDataUpdate();
    showHomeToast("Journal entry saved.");
  }catch(_){
    showHomeToast("Hindi na-save ang journal sa browser.");
  }
}

function editHomeJournalReal(id){
  const real=getRealJournals();
  const index=real.findIndex(item=>String(item?.id)===String(id));
  if(index<0)return;
  const entry=real[index];
  const currentTitle=String(entry.titleReal||entry.title||"").trim();
  const currentContent=String(entry.contentReal||entry.text||entry.content||"").trim();
  const nextTitle=window.prompt("Edit journal title:",currentTitle);
  if(nextTitle===null)return;
  const cleanTitle=String(nextTitle).trim();
  const nextContent=window.prompt("Edit journal entry:",currentContent);
  if(nextContent===null)return;
  const cleanContent=String(nextContent).trim();
  if(!cleanTitle||!cleanContent){
    showHomeToast("Hindi puwedeng walang title o journal.");
    return;
  }
  real[index]={
    ...entry,
    titleReal:cleanTitle,
    contentReal:cleanContent,
    updatedAtReal:new Date().toISOString()
  };
  try{
    localStorage.setItem(REAL_JOURNAL_KEY,JSON.stringify(real));
    emitRealDataUpdate();
    showHomeToast("Journal entry updated.");
  }catch(_){
    showHomeToast("Hindi na-update ang journal sa browser.");
  }
}

function deleteHomeJournalReal(id){
  const real=getRealJournals();
  const index=real.findIndex(item=>String(item?.id)===String(id));
  if(index<0)return;
  const entry=real[index];
  const title=String(entry?.titleReal||entry?.title||"this journal").trim();
  if(!window.confirm("Delete this journal entry?\\n\\n"+title))return;
  real.splice(index,1);
  try{
    localStorage.setItem(REAL_JOURNAL_KEY,JSON.stringify(real));
    emitRealDataUpdate();
    showHomeToast("Journal entry deleted.");
  }catch(_){
    showHomeToast("Hindi na-delete ang journal sa browser.");
  }
}

function demoFillReal(){
  if(!window.confirm("Load demo content? Lahat may [DEMO] label. Ang real entries mo hindi io-overwrite."))return;
  const demoEntry={
    idReal:"demo-"+Date.now(),
    titleReal:"[DEMO] First Calm Thought",
    contentReal:"[DEMO] This is demo journal for the Gumroad preview.",
    moodEmoji:"🌿",
    createdAtReal:new Date().toISOString(),
    isDemo:true
  };
  const current=getRealJournals();
  if(current.some(entry=>entry?.isDemo===true && String(entry?.titleReal||"").startsWith("[DEMO]"))){
    showHomeToast("Demo content is already loaded.");
    return;
  }
  try{
    localStorage.setItem(REAL_JOURNAL_KEY,JSON.stringify([...current,demoEntry].slice(0,50)));
    emitRealDataUpdate();
    location.reload();
  }catch(_){
    showHomeToast("Hindi na-save ang demo content sa browser.");
  }
}
window.demoFillReal=demoFillReal;

function renderPayapangIsip(){
  const track=document.querySelector("#bentoJournalList")||document.querySelector("#payapangIsipTrack")||document.querySelector("#journalTrack");
  if(!track)return;
  const real=getRealJournalViews();
  if(real.length===0){
    track.innerHTML='<div class="real-bento-empty" id="journalEmptyReal"><div class="empty-icon">🌿</div><p>0 items real</p><small>Real entries mo dito lalabas • No fake • For demo, try adding a journal.</small><form id="realJournalForm" class="real-bento-form"><input name="titleReal" id="journalTitleReal" maxlength="100" placeholder="Real journal title" required><textarea name="contentReal" id="journalTextReal" maxlength="5000" placeholder="Isulat ang totoong journal mo..." required><\/textarea><div class="real-bento-actions"><button id="saveJournalReal" type="submit">🌿 Gumawa ng Real</button><a href="pages/payapang-isip.html">Open Payapang Isip →</a></div><button type="button" class="demo-empty-real" onclick="demoFillReal()">Load Demo Content (labeled as demo)</button></div>';
    const form=$("#realJournalForm");
    if(form&&!form.dataset.bound){
      form.dataset.bound="1";
      form.addEventListener("submit",saveRealJournal);
    }
    return;
  }

  track.innerHTML=real.slice(0,3).map(entry=>
    '<article class="journal-item-real" data-journal-id="'+esc(entry.id)+'">'+
      '<div class="journal-top">'+
        '<span aria-hidden="true">'+esc(entry.mood||"🌿")+'</span>'+
        '<span class="journal-date">'+esc(formatDate(entry.createdAt))+'</span>'+
      '</div>'+
      '<div class="journal-actions-real" aria-label="Journal actions">'+
        '<button type="button" data-journal-edit="'+esc(entry.id)+'">Edit</button>'+
        '<button type="button" data-journal-delete="'+esc(entry.id)+'">Delete</button>'+
      '</div>'+
      '<h3>'+esc(entry.title||"")+'</h3>'+
      '<p>'+esc(entry.content.slice(0,160))+(entry.content.length>160?"…":"")+'</p>'+
    '</article>'
  ).join("");

  if(!track.dataset.journalActionsBound){
    track.dataset.journalActionsBound="1";
    track.addEventListener("click",event=>{
      const edit=event.target.closest?.("[data-journal-edit]");
      const del=event.target.closest?.("[data-journal-delete]");
      if(edit){
        editHomeJournalReal(edit.dataset.journalEdit);
        return;
      }
      if(del){
        deleteHomeJournalReal(del.dataset.journalDelete);
      }
    });
  }
}

function getRealMusicDatabaseExists(name){
  if(!window.indexedDB)return Promise.resolve(false);
  if(typeof indexedDB.databases!=="function")return Promise.resolve(true);
  return indexedDB.databases().then(rows=>rows.some(item=>item?.name===name)).catch(()=>true);
}
async function readRealMusicStore(dbName,storeName){
  const exists=await getRealMusicDatabaseExists(dbName);
  if(!exists)return [];
  return new Promise(resolve=>{
    let database=null;
    try{
      const request=indexedDB.open(dbName);
      request.onupgradeneeded=()=>{try{request.transaction?.abort()}catch(_){}};
      request.onsuccess=()=>{
        database=request.result;
        if(!database.objectStoreNames.contains(storeName)){
          database.close();resolve([]);return;
        }
        const req=database.transaction(storeName,"readonly").objectStore(storeName).getAll();
        req.onsuccess=()=>{const rows=Array.isArray(req.result)?req.result:[];database.close();resolve(rows)};
        req.onerror=()=>{database.close();resolve([])};
      };
      request.onerror=()=>resolve([]);
    }catch(_){resolve([])}
  });
}
async function getRealMusic(){
  let rows=await readRealMusicStore(REAL_MUSIC_DB,REAL_MUSIC_STORE);
  if(!rows.length)rows=await readRealMusicStore(MUSIC_DB,MUSIC_STORE);
  return rows.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function getRealFeeds(){
  try{
    const value=JSON.parse(localStorage.getItem("tubalhub_feeds")||"[]");
    return Array.isArray(value)?value:[];
  }catch{
    return [];
  }
}
function saveRealFeedImage(file){
  return new Promise((resolve,reject)=>{
    if(!file){resolve("");return}
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(reader.error||new Error("FileReader failed."));
    reader.readAsDataURL(file);
  });
}
async function saveRealFeed(event){
  event.preventDefault();
  const form=event.currentTarget;
  const text=String(form.elements.feedText?.value||"").trim();
  const file=form.elements.feedImage?.files?.[0]||null;
  if(!text){
    showHomeToast("Lagyan muna ng totoong post.");
    return;
  }
  if(file&&file.size>8*1024*1024){
    showHomeToast("Image must be 8 MB or smaller.");
    return;
  }
  try{
    const user=auth.currentUser;
    const image=await saveRealFeedImage(file);
    const real=getRealFeeds();
    real.unshift({
      id:window.crypto?.randomUUID?window.crypto.randomUUID():"local-"+Date.now(),
      author:user?.displayName||user?.email||"You",
      avatar:user?.photoURL||"",
      text,
      image,
      likes:0,
      comments:0,
      createdAt:new Date().toISOString()
    });
    localStorage.setItem(REAL_FEED_KEY,JSON.stringify(real));
    emitRealDataUpdate();
  }catch(_){
    showHomeToast("Hindi na-save ang real post.");
  }
}
function renderRealFeedsEmptyState(box){
  box.innerHTML='<div class="real-bento-empty"><div class="empty-icon" style="background:rgba(125,90,255,.15);">📱</div><p>Wala pang real posts</p><small>Real posts mo dito lalabas</small><form id="realFeedForm" class="real-feed-quick-form"><textarea name="feedText" maxlength="5000" placeholder="Isulat ang totoong post..." required></textarea><input name="feedImage" type="file" accept="image/*"><div class="real-bento-actions"><button type="submit">Save real post</button><a href="pages/feeds.html">Open Feeds →</a></div></form></div>';
  $("#realFeedForm")?.addEventListener("submit",saveRealFeed,{once:true});
}

function getRealGamePlayCount(id){
  const raw=localStorage.getItem("play_"+id+"_real")||"0";
  const n=parseInt(raw,10);
  return Number.isFinite(n)&&n>=0?n:0;
}
async function getRealGames(){
  try{
    const response=await fetch('data/games.json?v=1.2.16&t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('games.json '+response.status);
    const data=await response.json();
    const rows=Array.isArray(data)?data:(Array.isArray(data?.games)?data.games:[]);
    return rows.filter(g=>g&&g.idReal&&g.titleReal).map(g=>({
      ...g,
      id:String(g.id||g.idReal.replace(/_real$/,'')),
      title:String(g.title||g.titleReal),
      idReal:String(g.idReal),
      titleReal:String(g.titleReal),
      logoReal:String(g.logoReal||''),
      logoRealHD:String(g.logoRealHD||''),
      bannerReal:String(g.bannerReal||''),
      devReal:String(g.devReal||g.dev||''),
      linkReal:String(g.linkReal||('ctrlzone.html?game='+(g.id||''))),
      genre:String(g.genre||g.category||'Game'),
      category:String(g.category||g.genre||'Game'),
      description:String(g.description||''),
      officialUrl:String(g.officialUrl||'')
    }));
  }catch(error){
    console.warn('[TUBAL HUB real games]',error);
    return [];
  }
}
function playRealGame(id){
  const game=featuredGames.find(item=>String(item.id)===String(id));
  if(!game)return;
  const key="play_"+game.id+"_real";
  const count=getRealGamePlayCount(game.id)+1;
  localStorage.setItem(key,String(count));
  emitRealDataUpdate();
  location.href="pages/ctrlzone.html?game="+encodeURIComponent(game.id);
}
function emitRealDataUpdate(){
  window.dispatchEvent(new Event("tubalhub-real-data-update"));
}
function incrementRealMusicPlay(id){
  const plays=musicPlays();
  plays[id]=Number.isFinite(Number(plays[id]))?Number(plays[id])+1:1;
  localStorage.setItem(PLAYS_KEY,JSON.stringify(plays));
  updateRealMusicPlayCounts();
}
function updateRealMusicPlayCounts(){
  const plays=musicPlays();
  document.querySelectorAll("[data-real-plays]").forEach(el=>{
    const id=String(el.dataset.realPlays||"");
    el.textContent=(Number(plays[id]||0))+" plays";
  });
}
function realAudioSource(track){
  if(track?.blobUrlReal)return String(track.blobUrlReal);
  if(track?.fileUrlReal)return String(track.fileUrlReal);
  if(track?.blob instanceof Blob){
    const key=String(track.id??"");
    const current=state.realAudioUrls.get(key);
    if(current)return current;
    const url=URL.createObjectURL(track.blob);
    state.realAudioUrls.set(key,url);
    return url;
  }
  return "";
}
function clearRealAudioUrls(){
  state.realAudioUrls.forEach(url=>{try{URL.revokeObjectURL(url)}catch(_){}});
  state.realAudioUrls.clear();
}
function bindRealAudioPlayEvents(root=document){
  root.querySelectorAll("[data-real-audio-id]").forEach(audio=>{
    audio.addEventListener("play",()=>{
      if(audio.dataset.playCounted==="1")return;
      audio.dataset.playCounted="1";
      incrementRealMusicPlay(audio.dataset.realAudioId);
    });
    audio.addEventListener("ended",()=>{audio.dataset.playCounted="";});
  });
}
window.getRealJournals=getRealJournals;
window.getRealMusic=getRealMusic;
window.getRealFeeds=getRealFeeds;
window.getRealGames=getRealGames;
async function runRealDataAudit(){
  console.log("REAL Journals:",getRealJournals().length,"fake?",hasFakeFlag(getRealJournals())?"FAKE DETECTED":"REAL OK");
  const [music,feeds,games]=await Promise.all([getRealMusic(),Promise.resolve(getRealFeeds()),getRealGames()]);
  console.log("REAL Music:",music.length,"fake?",hasFakeFlag(music)?"FAKE DETECTED":"REAL OK");
  console.log("REAL Feeds:",feeds.length,"fake?",hasFakeFlag(feeds)?"FAKE DETECTED":"REAL OK");
  console.log("REAL Games:",games.length,"fake?",hasFakeFlag(games)?"FAKE DETECTED":"REAL OK");
}

export function createSlider(trackId,prevId,nextId,dotsId,slideSelector=".hero-slide"){
  const track=$("#"+trackId);if(!track)return null;
  const prev=$("#"+prevId),next=$("#"+nextId),dots=$("#"+dotsId);
  const horizontal=track.dataset.horizontal==="true";
  const slides=Array.from(track.querySelectorAll(slideSelector));
  if(!slides.length)return null;
  let index=0,startX=0,deltaX=0,dragging=false,autoTimer=null;
  const gap=()=>horizontal?(parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap)||0):0;
  const renderDots=()=>{
    if(!dots)return;
    dots.innerHTML=slides.map((_,i)=>'<button class="hero-dot '+(i===index?"active":"")+'" type="button" aria-label="Go to slide '+(i+1)+'"></button>').join("");
    $(".hero-dot",dots).forEach((dot,i)=>dot.addEventListener("click",()=>go(i)));
  };
  const render=()=>{
    if(horizontal){
      const card=slides[index];
      if(card)track.scrollTo({left:card.offsetLeft,behavior:"smooth"});
    }else{
      track.style.transform="translate3d("+(-index*100)+"%,0,0)";
    }
    $(".hero-dot",dots).forEach((dot,i)=>dot.classList.toggle("active",i===index));
  };
  const go=nextIndex=>{
    index=(nextIndex+slides.length)%slides.length;
    render();
  };
  const startAuto=()=>{
    clearInterval(autoTimer);autoTimer=setInterval(()=>go(index+1),horizontal?4000:5000);
  };
  const stopAuto=()=>{
    clearInterval(autoTimer);autoTimer=null;
  };
  prev?.addEventListener("click",()=>{go(index-1);startAuto()});
  next?.addEventListener("click",()=>{go(index+1);startAuto()});
  renderDots();render();
  track.setAttribute("data-slide-count",String(slides.length));
  track.addEventListener("pointerdown",e=>{
    dragging=true;startX=e.clientX;deltaX=0;track.classList.add("is-dragging");track.setPointerCapture?.(e.pointerId);
  });
  track.addEventListener("pointermove",e=>{if(dragging)deltaX=e.clientX-startX});
  const end=()=>{
    if(!dragging)return;
    dragging=false;track.classList.remove("is-dragging");
    if(Math.abs(deltaX)>=50)go(index+(deltaX<0?1:-1));else render();
    deltaX=0;startAuto();
  };
  track.addEventListener("pointerup",end);track.addEventListener("pointercancel",end);
  track.addEventListener("mouseenter",stopAuto);track.addEventListener("mouseleave",startAuto);
  track.addEventListener("touchstart",stopAuto,{passive:true});track.addEventListener("touchend",startAuto,{passive:true});
  startAuto();
  return {go,stopAuto,startAuto,get index(){return index}};
}

function initHeroSlider(){
  const slider=createSlider("heroTrack","heroPrev","heroNext","heroDots");
  $("#heroTrack")?.addEventListener("transitionend",()=>{});
  return slider;
}

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(MUSIC_DB,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(MUSIC_STORE)){const store=db.createObjectStore(MUSIC_STORE,{keyPath:"id"});store.createIndex("createdAt","createdAt")}};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("IndexedDB unavailable."));
  });
}
async function dbAll(){
  const database=await openDb();
  const rows=await new Promise((resolve,reject)=>{
    const tx=database.transaction(MUSIC_STORE,"readonly"),req=tx.objectStore(MUSIC_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error||new Error("Library unavailable."));
  });
  database.close();
  return rows.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function audioExt(type){
  const t=String(type||"").toLowerCase();if(t.includes("mpeg"))return"mp3";if(t.includes("wav"))return"wav";if(t.includes("ogg"))return"ogg";if(t.includes("webm"))return"webm";return"audio";
}
function musicLikes(){return safeJson(LIKES_KEY,{})}
function musicPlays(){return safeJson(PLAYS_KEY,{})}

function journalEntries(){return getRealJournalViews().slice(0,homeCardLimit())}
function renderGameScores(){
  const box=$("#gameScoreStack");if(!box)return;
  const readNumber=(keys)=>{
    for(const key of keys){
      const raw=localStorage.getItem(key);
      if(raw===null||raw==="")continue;
      const n=Number(raw);
      if(Number.isFinite(n))return n;
    }
    return null;
  };
  const stats=[
    ["Kills",readNumber(["ctrlzone_kills","tubalhub_game_kills"])],
    ["Wins",readNumber(["ctrlzone_wins","tubalhub_game_wins"])],
    ["Rank",localStorage.getItem("ctrlzone_rank")||localStorage.getItem("tubalhub_game_rank")||"—"]
  ];
  box.innerHTML=stats.map(([label,value])=>"<div class=\"game-score\"><strong>"+esc(value===null?"—":value)+"</strong><span>"+label+"</span></div>").join("");
}

function renderJournal(){
  const track=$("#journalTrack");if(!track)return;
  renderPayapangIsip();
}

let musicTracks=[];
async function loadMusic(){
  const track=$("#musicTrack");if(!track)return;
  musicTracks=await getRealMusic();
  if(!musicTracks.length){
    track.innerHTML='<div class="real-empty-card glass"><span class="real-empty-emoji" aria-hidden="true">🎵</span><p>Wala pang saved audio tracks.</p><a class="real-quick-link" href="pages/ai-music.html">Open AI Music →</a></div>';
    return;
  }
  const plays=musicPlays();
  track.innerHTML=musicTracks.slice(0,homeCardLimit()).map(t=>{
    const src=realAudioSource(t);
    const audio=src?'<audio class="bento-real-audio" src="'+esc(src)+'" controls preload="metadata" data-real-audio-id="'+esc(t.id)+'"></audio>':"";
    return '<article class="real-data-card music-real-card data-track-card" data-music-id="'+esc(t.id)+'"><div class="music-real-cover"><span class="music-real-emoji home-emoji" aria-hidden="true">🎵</span><button class="music-real-play" type="button" data-play-music="'+esc(t.id)+'" aria-label="Play '+esc(t.title||"saved track")+'">▶</button></div><div class="music-mini-wave"><i></i><i></i><i></i></div><div class="music-real-meta"><h3 class="music-real-title">'+esc(t.title||"Saved track")+'</h3><p class="music-real-sub">'+esc(t.genre||t.prompt||"Saved audio")+'</p>'+audio+'<span data-real-plays="'+esc(t.id)+'" class="real-data-count">'+Number(plays[t.id]||0)+' plays</span></div></article>';
  }).join("");
  bindRealAudioPlayEvents(track);
  track.querySelectorAll("[data-play-music]").forEach(button=>button.addEventListener("click",()=>playMusic(button.dataset.playMusic)));
}

async function getMusic(id){try{return musicTracks.find(t=>String(t.id)===String(id))||await (async()=>{const rows=await dbAll();return rows.find(t=>String(t.id)===String(id))})()}catch(_){return null}}
async function playMusic(id){
  const track=await getMusic(id);if(!track)return;
  const audio=$("#homeMusicAudio");if(!audio)return;
  const source=realAudioSource(track);if(!source)return;
  state.selectedMusic=track;
  audio.src=source;
  try{
    await ensureAnalyser(audio);
    await audio.play();
    document.querySelectorAll(".music-real-card.is-playing,.bento-music-item.is-playing,.featured-track-item.is-playing").forEach(card=>card.classList.remove("is-playing"));
    document.querySelector('.music-real-card[data-music-id="'+CSS.escape(String(id))+'"]')?.classList.add("is-playing");
    document.querySelector('.bento-music-item[data-bento-music-id="'+CSS.escape(String(id))+'"]')?.classList.add("is-playing");
    document.querySelector('.featured-track-item[data-featured-music-id="'+CSS.escape(String(id))+'"]')?.classList.add("is-playing");
    $("#featuredTrack > .featured-slide:nth-child(2)")?.classList.add("is-playing");
    drawFeaturedMusicWave();
    drawBentoWave();
  }catch(_){
    showHomeToast("Press play again to start the saved audio.");
  }
}
async function ensureAnalyser(audio){
  if(state.analyser){
    if(state.audioContext?.state==="suspended")await state.audioContext.resume();
    return;
  }
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw new Error("Web Audio is not supported.");
  state.audioContext=new Ctx();
  state.analyser=state.audioContext.createAnalyser();state.analyser.fftSize=128;state.analyser.smoothingTimeConstant=.78;
  state.source=state.audioContext.createMediaElementSource(audio);state.source.connect(state.analyser);state.analyser.connect(state.audioContext.destination);
  drawHeroWave();
}
function drawHeroWave(){
  const canvas=$("#heroMusicCanvas"),ctx=canvas?.getContext("2d");if(!canvas||!ctx||!state.analyser)return;
  const data=new Uint8Array(state.analyser.frequencyBinCount);
  const frame=()=>{
    state.visualFrame=requestAnimationFrame(frame);
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),width=Math.max(1,Math.floor(rect.width*dpr)),height=Math.max(1,Math.floor(rect.height*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
    ctx.clearRect(0,0,width,height);
    state.analyser.getByteFrequencyData(data);
    const bars=Math.min(64,data.length),gap=Math.max(2,width/620),barW=Math.max(2,(width-gap*(bars-1))/bars);
    for(let i=0;i<bars;i++){
      const amp=data[i]/255,barH=Math.max(2,amp*height*.72),x=i*(barW+gap),y=(height-barH)/2;
      const grad=ctx.createLinearGradient(0,y,0,y+barH);grad.addColorStop(0,"#1dff91");grad.addColorStop(.55,"#8ed66d");grad.addColorStop(1,"#7d5aff");
      ctx.fillStyle=grad;ctx.fillRect(x,y,barW,barH);
    }
  };
  cancelAnimationFrame(state.visualFrame);frame();
}


function drawBentoWave(){
  if(!state.analyser)return;
  const bars=[...document.querySelectorAll("#bentoMusicList .bento-music-wave i")],data=new Uint8Array(state.analyser.frequencyBinCount);
  const frame=()=>{
    state.analyser.getByteFrequencyData(data);
    bars.forEach((bar,i)=>{const idx=Math.min(data.length-1,Math.floor(i*data.length/3));bar.style.height=(6+Math.round((data[idx]/255)*18))+"px"});
    if(document.querySelector(".bento-music-item.is-playing"))state.bentoWaveFrame=requestAnimationFrame(frame);
  };
  cancelAnimationFrame(state.bentoWaveFrame);state.bentoWaveFrame=requestAnimationFrame(frame);
}

function storageAvatar(){
  try{return localStorage.getItem("tubalhub_avatar")||""}catch(_){return ""}
}

function parseStoredPosts(){
  return getRealFeeds().map((post,index)=>({
    id:post.id||String(index),
    author:post.author||"",
    avatar:post.avatar||"",
    image:post.image||post.imageUrl||post.mediaUrl||"",
    text:String(post.text||post.content||post.message||"").trim(),
    likes:Number(post.likes||0),
    comments:Number(post.comments||0),
    createdAt:post.createdAt||post.date||0
  })).filter(post=>post.text);
}
async function firestorePosts(){return[]}
async function renderFeeds(){
  const track=$("#feedTrack");if(!track)return;
  const posts=parseStoredPosts();
  if(!posts.length){
    renderRealFeedsEmptyState(track);
    return;
  }
  const likes=safeJson("tubalhub_home_feed_likes",{});
  track.innerHTML=posts.slice(0,homeCardLimit()).map(p=>{
    const avatar=p.avatar||"";
    const base=Math.max(0,Number(p.likes||0));
    const liked=likes[p.id]===true;
    return '<article class="real-data-card feed-update-card data-track-card" data-feed-id="'+esc(p.id)+'" data-base-likes="'+base+'"><div class="feed-update-head"><div class="feed-update-avatar">'+(avatar?'<img class="feed-avatar-img" src="'+esc(avatar)+'" alt="" loading="lazy">':"")+'</div><div class="feed-update-author"><strong>'+esc(p.author||"")+'</strong><small>'+esc(formatDate(p.createdAt))+'</small></div></div><p class="feed-update-text">'+esc((p.text||"").slice(0,220))+(String(p.text||"").length>220?"…":"")+'</p>'+(p.image?'<img class="feed-real-image" src="'+esc(p.image)+'" alt="" loading="lazy">':"")+'<div class="feed-update-stats"><span data-home-like-count="'+esc(p.id)+'">'+(base+(liked?1:0))+' likes</span><span>'+Number(p.comments||0)+' comments</span><button type="button" class="like-btn '+(liked?"liked":"")+'" data-feed-like="'+esc(p.id)+'">'+(liked?"Liked":"Like")+'</button></div></article>';
  }).join("");
  $("#feedTrack [data-feed-like]").forEach(button=>button.addEventListener("click",()=>toggleFeedLike(button)));
}
function toggleFeedLike(button){
  const id=button.dataset.feedLike;
  const key="tubalhub_home_feed_likes",likes=safeJson(key,{});
  const next=!Boolean(likes[id]);likes[id]=next;localStorage.setItem(key,JSON.stringify(likes));
  button.classList.toggle("liked",next);button.textContent=next?"Liked":"Like";
  button.classList.remove("bursting");void button.offsetWidth;button.classList.add("bursting");
  const card=button.closest(".feed-card");
  const base=Number(card?.dataset.baseLikes||0);
  const stat=card?.querySelector("[data-home-like-count]");
  if(stat)stat.textContent=(base+(next?1:0))+" likes";
  showHomeToast(next?"Liked this post.":"Like removed.");
}
function showHomeToast(message){
  const toast=$("#homeToast");if(!toast)return;
  toast.textContent=message;toast.classList.add("open");clearTimeout(showHomeToast.timer);
  showHomeToast.timer=setTimeout(()=>toast.classList.remove("open"),2000);
}
const GAMES_URL=new URL("data/games.json",document.baseURI).href;
const GAMES_KEY="tubalhub_ctrlzone_games";
let featuredGames=[];
let gamesSlider=null;

function readObject(key){
  try{const value=JSON.parse(localStorage.getItem(key)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}catch(_){return {}}
}
function readGamesFromStorage(){return parseRealArray(GAMES_KEY)}
async function loadFeaturedGames(){
  featuredGames=await getRealGames();
  renderFeaturedGames();
  renderFeaturedGamesPreview();
}
function gameStats(game){
  return {players:getRealGamePlayCount(game.id),rating:null,lastPlayed:0};
}
function formatLastPlayed(value){
  if(!value)return "Never";
  const d=new Date(value);if(Number.isNaN(d.getTime()))return "—";
  return d.toLocaleString("en-PH",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function gameStatMarkup(game){
  const plays=getRealGamePlayCount(game.id);
  return '<div class="game-feature-stat"><span class="home-emoji" aria-hidden="true">▶</span><strong title="Real local play count">'+esc(plays)+'</strong><span>local plays</span></div>';
}
function featuredGameMarkup(game){
  const safeA=game.colorA||"#173b2a",safeB=game.colorB||"#07100b";
  const category=game.category||game.genre||"Game";
  return '<article class="game-feature-card" data-game-id="'+esc(game.id)+'" style="--game-a:'+esc(safeA)+';--game-b:'+esc(safeB)+'">'+
    '<div class="game-feature-cover"><span class="game-feature-emoji" aria-hidden="true">'+esc(getRealGameInitials(game))+'</span><button class="game-feature-play" type="button" data-real-game-play="'+esc(game.id)+'" aria-label="Play '+esc(game.title)+'">▶️</button></div>'+
    '<div class="game-feature-body"><div class="game-feature-top"><h3>'+esc(game.title)+'</h3><span class="game-category">'+esc(category)+'</span></div>'+
    '<p class="game-feature-desc">'+esc(game.description||"")+'</p><div class="game-feature-stats">'+gameStatMarkup(game)+'</div></div>'+
    '<div class="game-feature-footer"><button class="game-feature-playnow" type="button" data-real-game-play="'+esc(game.id)+'">Play Now</button></div>'+
    '</article>';
}
function renderFeaturedGames(){
  const track=$("#gamesTrack");if(!track)return;
  if(!featuredGames.length){
    track.innerHTML='<div class="real-empty-card glass"><span class="real-empty-emoji" aria-hidden="true">NO LOGO</span><p>Wala pa games, upload real</p><a class="real-quick-link" href="pages/ctrlzone.html">Open CTRLZONE →</a></div>';
    gamesSlider?.stopAuto?.();
    return;
  }
  track.innerHTML=featuredGames.map(featuredGameMarkup).join("");
  gamesSlider?.stopAuto?.();
  gamesSlider=null;
  renderAllSliderDots();
  if(!window.matchMedia?.("(hover: none), (pointer: coarse)").matches){
    track.querySelectorAll(".game-feature-card").forEach(card=>{
      card.addEventListener("pointermove",e=>{
        const r=card.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;
        card.style.setProperty("--rx",clamp((.5-py)*10,-10,10)+"deg");
        card.style.setProperty("--ry",clamp((px-.5)*10,-10,10)+"deg");
      },{passive:true});
      card.addEventListener("pointerleave",()=>{
        card.style.setProperty("--rx","0deg");card.style.setProperty("--ry","0deg");
      });
    });
  }
}
function saveGameStats(){}
function playFeaturedGame(id,button){
  burstGameButton(button,6);
  playRealGame(id);
}
function burstGameButton(button,count=6){
  if(!button)return;
  const r=button.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const dot=document.createElement("i");dot.className="game-burst-dot";
    const angle=(Math.PI*2/count)*i,dx=Math.cos(angle)*(26+i*3),dy=Math.sin(angle)*(26+i*3);
    dot.style.left=(r.left+r.width/2)+"px";dot.style.top=(r.top+r.height/2)+"px";
    document.body.appendChild(dot);
    dot.animate([{transform:"translate(-50%,-50%) scale(1)",opacity:1},{transform:"translate(calc(-50% + "+dx+"px),calc(-50% + "+dy+"px)) scale(.2)",opacity:0}],{duration:480,fill:"forwards",easing:"cubic-bezier(.16,1,.3,1)"}).onfinish=()=>dot.remove();
  }
}
function burstFooterSend(button,count=6){
  if(!button)return;
  const r=button.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const dot=document.createElement("i");dot.className="footer-send-dot";
    const angle=(Math.PI*2/count)*i,dx=Math.cos(angle)*(24+i*3),dy=Math.sin(angle)*(24+i*3);
    dot.style.left=(r.left+r.width/2)+"px";dot.style.top=(r.top+r.height/2)+"px";
    document.body.appendChild(dot);
    dot.animate([{transform:"translate(-50%,-50%) scale(1)",opacity:1},{transform:"translate(calc(-50% + "+dx+"px),calc(-50% + "+dy+"px)) scale(.2)",opacity:0}],{duration:480,fill:"forwards",easing:"cubic-bezier(.16,1,.3,1)"}).onfinish=()=>dot.remove();
  }
}
function initFooterNewsletter(){
  const form=$("#footerNewsletterForm"),input=$("#footerNewsletterEmail"),status=$("#footerNewsletterStatus"),button=$("#footerNewsletterSend");
  if(!form||!input||!status||!button)return;
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const email=input.value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      status.textContent="Please enter a valid email address.";
      status.className="footer-newsletter-status is-error";
      return;
    }
    let list=[];
    try{const raw=JSON.parse(localStorage.getItem("tubalhub_newsletter_subscribers")||"[]");list=Array.isArray(raw)?raw:[]}catch(_){}
    if(!list.includes(email))list.push(email);
    try{localStorage.setItem("tubalhub_newsletter_subscribers",JSON.stringify(list))}catch(_){}
    input.value="";
    status.textContent="Saved on this device.";
    status.className="footer-newsletter-status is-ok";
    button.classList.remove("is-pop");void button.offsetWidth;button.classList.add("is-pop");
    burstFooterSend(button,6);
  });
}
function initFooterSmoothLinks(){
  document.querySelectorAll('#mainFooter a[href^="#"]').forEach(link=>{
    link.addEventListener("click",event=>{
      const id=link.getAttribute("href"),target=id&&document.querySelector(id);
      if(!target)return;
      event.preventDefault();
      target.scrollIntoView({behavior:"smooth",block:"start"});
      history.replaceState(null,"",id);
    });
  });
}

function initFooterSpotlight(){
  const footer=$("#mainFooter");
  if(!footer||window.matchMedia?.("(hover: none), (pointer: coarse)").matches)return;
  let frame=0;
  footer.addEventListener("pointermove",event=>{
    const rect=footer.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      footer.style.setProperty("--footer-x",x+"px");
      footer.style.setProperty("--footer-y",y+"px");
      frame=0;
    });
  },{passive:true});
}

function initFooterMessages(){
  const button=$("#footerMessagesButton");
  if(!button)return;
  button.addEventListener("click",()=>{
    const botToggle=$("#chatToggleReal");
    if(botToggle){
      botToggle.click();
    }else{
      window.location.href="pages/chat.html";
    }
  });
}

function readRealCollectionLength(keys){
  for(const key of keys){
    try{
      const raw=localStorage.getItem(key);
      if(raw===null)continue;
      const parsed=raw?JSON.parse(raw):[];
      if(Array.isArray(parsed))return parsed.length;
    }catch(_){}
  }
  return 0;
}

function updateLiveStatusReal(){
  const journals=readRealCollectionLength(["tubalhub_journals_real","tubalhub_journal"]);
  const feeds=readRealCollectionLength(["tubalhub_feeds"]);
  const cart=readRealCollectionLength(["tubalhub_cart_real","tubalhub-shop-cart-v1"]);
  const el=$("#localDataStatus");
  if(el)el.textContent=`${journals} journals • ${feeds} posts • ${cart} cart • real`;
}

async function initFooter(){
  const fallbackVersion="1.2.16";
  const fallbackBuild="2026-09-25_1216";
  const setVersion=(version,build)=>{
    const cleanVersion=String(version||fallbackVersion).trim()||fallbackVersion;
    const cleanBuild=String(build||fallbackBuild).trim()||fallbackBuild;
    const liveVersion=$("#liveVersion");
    const liveBuild=$("#liveBuild");
    if(liveVersion)liveVersion.textContent="v"+cleanVersion;
    if(liveBuild)liveBuild.textContent=cleanBuild;
    localStorage.setItem("tubalhub_version_real",cleanVersion);
  };

  setVersion(fallbackVersion,fallbackBuild);
  updateLiveStatusReal();

  try{
    const r=await fetch("version.json?v=1.2.16&t="+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error("version "+r.status);
    const data=await r.json();
    setVersion(data?.version,data?.build);
  }catch(_){
    setVersion(fallbackVersion,fallbackBuild);
  }

  const update=()=>$("#homeOnlineDot")?.classList.toggle("offline",!navigator.onLine);
  update();
  const textEl=$("#homeOnlineText");
  if(textEl)textEl.textContent=navigator.onLine?"Online":"Offline";
  addEventListener("online",()=>{update();if(textEl)textEl.textContent="Online"});
  addEventListener("offline",()=>{update();if(textEl)textEl.textContent="Offline"});

  updateLiveStatusReal();
  addEventListener("storage",event=>{
    if(["tubalhub_journals_real","tubalhub_journal","tubalhub_feeds","tubalhub_cart_real","tubalhub-shop-cart-v1"].includes(event.key||"")){
      updateLiveStatusReal();
    }
  });

  initFooterSpotlight();
  initFooterMessages();
}
const sliderTimers=new Map();

function renderAllSliderDots(){
  document.querySelectorAll(".slider-track").forEach(track=>{
    const cards=[...track.children].filter(el=>el.offsetWidth>0);
    if(!cards.length)return;
    let dots=track.parentElement.querySelector(".auto-slider-dots");
    if(!dots){
      dots=document.createElement("div");
      dots.className="auto-slider-dots";
      track.parentElement.appendChild(dots);
    }
    if(dots.dataset.count!==String(cards.length)){
      dots.dataset.count=String(cards.length);
      dots.innerHTML=cards.map((_,i)=>'<button type="button" data-slider-index="'+i+'" aria-label="Go to card '+(i+1)+'"></button>').join("");
      dots.querySelectorAll("button").forEach((b,i)=>b.addEventListener("click",()=>cards[i]&&track.scrollTo({left:cards[i].offsetLeft,behavior:"smooth"})));
    }
    const active=()=>{
      let best=0,min=Infinity;
      cards.forEach((c,i)=>{const d=Math.abs(track.scrollLeft-c.offsetLeft);if(d<min){min=d;best=i}});
      dots.querySelectorAll("button").forEach((b,i)=>b.classList.toggle("active",i===best));
    };
    if(track.dataset.dotsScrollReady!=="1"){
      track.dataset.dotsScrollReady="1";
      track.addEventListener("scroll",active,{passive:true});
    }
    active();
  });
}

function initAllSliders(){
  document.querySelectorAll(".slider-track").forEach(track=>{
    if(track.dataset.sliderReady==="1")return;
    track.dataset.sliderReady="1";
    const id=track.id;
    const prev=$("#"+id+"Prev"),next=$("#"+id+"Next");
    const cards=()=>Array.from(track.children).filter(el=>el.offsetWidth>0);
    let startX=0,dragX=0,dragging=false,touchStartX=0;

    const cardStep=()=>{
      const card=cards()[0];
      return card?card.getBoundingClientRect().width+(isMobileHome()?12:20):0;
    };
    const scrollByCards=dir=>{
      const step=cardStep();
      if(!step)return;
      const visible=Math.max(1,Math.floor(track.clientWidth/Math.max(step,1)));
      track.scrollBy({left:dir*step*visible,behavior:"smooth"});
    };
    prev?.addEventListener("click",()=>scrollByCards(-1));
    next?.addEventListener("click",()=>scrollByCards(1));

    // Desktop pointer drag.
    track.addEventListener("pointerdown",e=>{
      if(e.pointerType==="touch")return;
      dragging=true;startX=e.clientX;dragX=0;
      track.classList.add("is-dragging");
      track.setPointerCapture?.(e.pointerId);
    });
    track.addEventListener("pointermove",e=>{
      if(dragging)dragX=e.clientX-startX;
    });
    const endPointer=()=>{
      if(!dragging)return;
      dragging=false;
      track.classList.remove("is-dragging");
      if(Math.abs(dragX)>=50)track.scrollBy({left:dragX<0?cardStep()||300:-(cardStep()||300),behavior:"smooth"});
      dragX=0;
    };
    track.addEventListener("pointerup",endPointer);
    track.addEventListener("pointercancel",endPointer);

    // Mobile touch swipe: threshold 50px, then snap one card.
    track.addEventListener("touchstart",e=>{
      if(!e.touches?.length)return;
      touchStartX=e.touches[0].clientX;
    },{passive:true});
    track.addEventListener("touchmove",e=>{
      if(!e.touches?.length)return;
      const delta=e.touches[0].clientX-touchStartX;
      if(Math.abs(delta)>10)track.classList.add("is-touching");
    },{passive:true});
    track.addEventListener("touchend",e=>{
      const touch=e.changedTouches?.[0];
      if(!touch)return;
      const delta=touch.clientX-touchStartX;
      if(Math.abs(delta)>=50){
        const step=cardStep()||300;
        track.scrollBy({left:delta<0?step:-step,behavior:"smooth"});
      }
      track.classList.remove("is-touching");
      touchStartX=0;
    },{passive:true});

    const timer=setInterval(()=>{
      if(document.hidden)return;
      if(isMobileHome() && track.classList.contains("is-touching"))return;
      if(track.matches(":hover"))return;
      const step=cardStep()||300;
      track.scrollBy({left:step,behavior:"smooth"});
    },5000);
    sliderTimers.set(id,timer);
    if("MutationObserver" in window){
      const observer=new MutationObserver(()=>requestAnimationFrame(renderAllSliderDots));
      observer.observe(track,{childList:true});
    }
  });
}
function initHorizontalSections(){initAllSliders();}
function cleanup(){
  if(state.heroTimer)clearInterval(state.heroTimer);
  if(state.musicUrl)URL.revokeObjectURL(state.musicUrl);
  cancelAnimationFrame(state.visualFrame);
  try{state.audioContext?.close()}catch(_){}
}
function initScrollReveal(){
  const animate=(el,i=0)=>{
    if(el.dataset.revealed==="1")return;
    el.dataset.revealed="1";
    if(!el.animate){el.style.opacity="1";return}
    el.animate(
      [{opacity:0,transform:"translate3d(0,18px,0)"},{opacity:1,transform:"translate3d(0,0,0)"}],
      {duration:600,delay:(i%10)*80,easing:"cubic-bezier(.16,1,.3,1)",fill:"none"}
    ).onfinish=()=>{el.style.opacity="1";el.style.removeProperty("transform")}
  };
  const scan=()=>{
    document.querySelectorAll("#journalTrack > *,#musicTrack > *,#feedTrack > *,#gamesTrack > *").forEach((el,i)=>animate(el,i));
  };
  scan();
  if("MutationObserver" in window){
    const mo=new MutationObserver(()=>scan());
    ["journalTrack","musicTrack","feedTrack","gamesTrack"].forEach(id=>{
      const node=$("#"+id);if(node)mo.observe(node,{childList:true});
    });
  }
}

/* =========================================================
   FEATURED WEBSITE SLIDER — real website data
   ========================================================= */
const featuredWebsiteState={index:0,autoTimer:null,startX:0,deltaX:0,dragging:false,initialized:false};
function featuredWebsiteSlides(){return $("#featuredTrack > .featured-slide")?Array.from(document.querySelectorAll("#featuredTrack > .featured-slide")):[]}
function updateFeaturedDots(){
  const dots=$("#featuredDots"),slides=featuredWebsiteSlides();if(!dots)return;
  dots.innerHTML=slides.map((_,i)=>"<button type=\"button\" class=\"featured-dot "+(i===featuredWebsiteState.index?"active":"")+"\" data-featured-dot=\""+i+"\" aria-label=\"Go to featured slide "+(i+1)+"\"></button>").join("");
  dots.querySelectorAll("[data-featured-dot]").forEach(b=>b.addEventListener("click",()=>goFeaturedWebsite(Number(b.dataset.featuredDot),true)));
}
function renderFeaturedWebsiteSlide(){
  const track=$("#featuredTrack"),slides=featuredWebsiteSlides();if(!track||!slides.length)return;
  featuredWebsiteState.index=(featuredWebsiteState.index+slides.length)%slides.length;
  track.style.transform="translate3d("+(-featuredWebsiteState.index*20)+"%,0,0)";
  updateFeaturedDots();
}
function goFeaturedWebsite(index,manual=false){
  const slides=featuredWebsiteSlides();if(!slides.length)return;
  featuredWebsiteState.index=(index+slides.length)%slides.length;renderFeaturedWebsiteSlide();if(manual)restartFeaturedWebsiteAuto();
}
function nextFeaturedWebsite(){goFeaturedWebsite(featuredWebsiteState.index+1)}
function prevFeaturedWebsite(){goFeaturedWebsite(featuredWebsiteState.index-1)}
function stopFeaturedWebsiteAuto(){clearInterval(featuredWebsiteState.autoTimer);featuredWebsiteState.autoTimer=null}
function restartFeaturedWebsiteAuto(){stopFeaturedWebsiteAuto();featuredWebsiteState.autoTimer=setInterval(nextFeaturedWebsite,4000)}
function initFeaturedWebsiteSlider(){
  const wrapper=$("#featuredTrackWrapper"),track=$("#featuredTrack"),slides=featuredWebsiteSlides();if(!wrapper||!track||!slides.length||featuredWebsiteState.initialized)return;
  featuredWebsiteState.initialized=true;
  $("#featuredNext")?.addEventListener("click",nextFeaturedWebsite);$("#featuredPrev")?.addEventListener("click",prevFeaturedWebsite);
  $("#featuredTrackNext")?.addEventListener("click",nextFeaturedWebsite);$("#featuredTrackPrev")?.addEventListener("click",prevFeaturedWebsite);
  wrapper.addEventListener("mouseenter",stopFeaturedWebsiteAuto);wrapper.addEventListener("mouseleave",restartFeaturedWebsiteAuto);
  wrapper.addEventListener("focusin",stopFeaturedWebsiteAuto);wrapper.addEventListener("focusout",e=>{if(!wrapper.contains(e.relatedTarget))restartFeaturedWebsiteAuto()});
  wrapper.addEventListener("pointerdown",e=>{featuredWebsiteState.dragging=true;featuredWebsiteState.startX=e.clientX;featuredWebsiteState.deltaX=0;track.classList.add("is-dragging");wrapper.setPointerCapture?.(e.pointerId);stopFeaturedWebsiteAuto()});
  wrapper.addEventListener("pointermove",e=>{if(featuredWebsiteState.dragging)featuredWebsiteState.deltaX=e.clientX-featuredWebsiteState.startX});
  const end=e=>{if(!featuredWebsiteState.dragging)return;const delta=featuredWebsiteState.deltaX;featuredWebsiteState.dragging=false;featuredWebsiteState.deltaX=0;track.classList.remove("is-dragging");if(Math.abs(delta)>=50)goFeaturedWebsite(featuredWebsiteState.index+(delta<0?1:-1),true);else renderFeaturedWebsiteSlide();restartFeaturedWebsiteAuto();if(e?.pointerId!=null)wrapper.releasePointerCapture?.(e.pointerId)};
  wrapper.addEventListener("pointerup",end);wrapper.addEventListener("pointercancel",end);
  document.addEventListener("keydown",e=>{if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;if(e.target?.closest?.("#featuredWebsite")){e.key==="ArrowRight"?nextFeaturedWebsite():prevFeaturedWebsite();restartFeaturedWebsiteAuto()}});
  renderFeaturedWebsiteSlide();restartFeaturedWebsiteAuto();
}
function renderFeaturedJournalPreview(entries){
  const box=$("#featuredJournalPreview"),count=$("#featuredJournalCount");if(!box)return;
  if(count)count.textContent=String(entries.length);
  if(!entries.length){box.innerHTML='<div class="featured-empty">Wala pang saved journal entries.</div>';return}
  box.innerHTML=entries.slice(0,3).map(e=>'<div class="featured-preview-item"><span class="featured-preview-mood">'+esc(e.mood||"🌿")+'</span><div><strong>'+esc(e.title||"Untitled")+'</strong><small>'+esc(formatDate(e.createdAt))+'</small><p>'+esc(e.content)+'</p></div></div>').join("");
}
async function renderFeaturedMusicPreview(rows){
  const box=$("#featuredMusicTracks"),count=$("#featuredMusicCount"),wave=$("#featuredMusicWave");if(!box)return;
  if(count)count.textContent=String(rows.length);
  if(wave&&!wave.childElementCount)wave.innerHTML=Array.from({length:12},(_,i)=>"<i style=\"--bar-delay:"+i*45+"ms\"></i>").join("");
  if(!rows.length){box.innerHTML='<div class="featured-empty">Wala pang saved audio tracks.</div>';return}
  const plays=musicPlays();
  box.innerHTML=rows.slice(0,3).map(t=>{
    const src=realAudioSource(t);
    const audio=src?'<audio class="featured-real-audio" src="'+esc(src)+'" controls preload="metadata" data-real-audio-id="'+esc(t.id)+'"></audio>':"";
    return '<div class="featured-preview-item featured-track-item" data-featured-music-id="'+esc(t.id)+'"><span class="featured-track-play-wrap"><button class="featured-track-play" type="button" data-featured-play="'+esc(t.id)+'" aria-label="Play '+esc(t.title||"saved track")+'">▶</button></span><div style="min-width:0;flex:1"><strong>'+esc(t.title||"Saved track")+'</strong><small>'+esc(t.genre||t.prompt||"Saved audio")+'</small>'+audio+'<span class="featured-real-play-count" data-real-plays="'+esc(t.id)+'">'+Number(plays[t.id]||0)+' plays</span></div></div>';
  }).join("");
  bindRealAudioPlayEvents(box);
  box.querySelectorAll("[data-featured-play]").forEach(button=>button.addEventListener("click",e=>{e.stopPropagation();playMusic(button.dataset.featuredPlay)}));
}
function renderFeaturedGamesPreview(){
  const box=$("#featuredGamesPreview");if(!box)return;
  const rows=featuredGames.slice(0,4);
  if(!rows.length){box.innerHTML='<div class="featured-empty">Wala pa games, upload real.</div>';return}
  box.innerHTML=rows.map(g=>'<a class="featured-game-float-card" href="pages/ctrlzone.html?game='+encodeURIComponent(g.id)+'" data-real-game-play="'+esc(g.id)+'"><span class="featured-game-float-emoji">'+esc(getRealGameInitials(g))+'</span><strong>'+esc(g.title)+'</strong><small>'+getRealGamePlayCount(g.id)+' local plays</small><b>Play Now →</b></a>').join("");
  if(!window.matchMedia?.("(hover:none),(pointer:coarse)").matches){
    box.querySelectorAll(".featured-game-float-card").forEach(card=>{
      card.addEventListener("pointermove",e=>{
        const r=card.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;
        card.style.setProperty("--frx",clamp((.5-py)*10,-10,10)+"deg");card.style.setProperty("--fry",clamp((px-.5)*10,-10,10)+"deg");
      },{passive:true});
      card.addEventListener("pointerleave",()=>{
        card.style.setProperty("--frx","0deg");card.style.setProperty("--fry","0deg");
      });
    });
  }
}
function renderFeaturedFeedsPreview(rows){
  const box=$("#featuredFeedPreview");if(!box)return;
  if(!rows.length){box.innerHTML='<div class="featured-empty">Wala pang real posts. Mag post ng real sa Feeds.</div>';return}
  box.innerHTML=rows.slice(0,2).map(p=>{
    const avatar=p.avatar||"";
    return '<article class="featured-feed-card"><div class="featured-feed-card-head"><span class="featured-feed-avatar">'+(avatar?'<img src="'+esc(avatar)+'" alt="" loading="lazy">':"")+'</span><div><strong>'+esc(p.author||"")+'</strong><small>'+esc(formatDate(p.createdAt))+'</small></div></div><p>'+esc(p.text||"")+'</p>'+(p.image?'<img class="real-feed-image" src="'+esc(p.image)+'" alt="" loading="lazy">':"")+'<span class="featured-feed-like">'+Math.max(0,Number(p.likes||0))+' likes</span></article>';
  }).join("");
}
function renderFeaturedWebsiteData(journal,music,posts,games){
  renderFeaturedJournalPreview(journal);
  renderFeaturedMusicPreview(music);
  renderFeaturedGamesPreview();
  renderFeaturedFeedsPreview(posts);
  const gamesCount=$("#featuredGamesCount");if(gamesCount)gamesCount.textContent=String(games.length);
  const feedsCount=$("#featuredFeedsCount");if(feedsCount)feedsCount.textContent=String(posts.length);
  const musicCount=$("#featuredMusicCount");if(musicCount)musicCount.textContent=String(music.length);
}
async function loadRealPageTitle(path,targetId){
  try{
    const response=await fetch(path,{cache:"no-store"});
    if(!response.ok)throw new Error("Page "+response.status);
    const pageHtml=await response.text();
    const parsed=new DOMParser().parseFromString(pageHtml,"text/html");
    const title=String(parsed?.title||"").trim();
    if(title&&$(targetId))$(targetId).textContent=title;

    if(path.indexOf("payapang-isip.html")!==-1){
      const summary=String(parsed?.querySelector(".hero-copy")?.textContent||"").replace(/\s+/g," ").trim();
      const summaryEl=$("#featuredPeaceSummary");
      if(summary&&summaryEl)summaryEl.textContent=summary;

      const sectionNames=[...parsed.querySelectorAll(".pi-section .section-heading h2")]
        .map(el=>String(el.textContent||"").replace(/\s+/g," ").trim())
        .filter(Boolean);
      const preview=$("#featuredJournalPreview");
      if(preview&&sectionNames.length){
        preview.innerHTML=sectionNames.slice(0,6).map(name=>
          '<div class="featured-preview-item"><span class="featured-preview-mood" aria-hidden="true">•</span><div><strong>'+esc(name)+'</strong><small>Real section from Payapang Isip</small></div></div>'
        ).join("");
      }
    }
  }catch(_){}  
}
function drawFeaturedMusicWave(){
  if(!state.analyser)return;const bars=[...document.querySelectorAll("#featuredMusicWave i")],data=new Uint8Array(state.analyser.frequencyBinCount);
  const frame=()=>{const slide=$("#featuredTrack > .featured-slide:nth-child(2)");const active=document.querySelector(".featured-track-item.is-playing");if(!active&&!slide?.classList.contains("is-playing")){state.featuredWaveFrame=null;return}state.analyser.getByteFrequencyData(data);bars.forEach((bar,i)=>{const idx=Math.min(data.length-1,Math.floor(i*data.length/bars.length));bar.style.height=(6+Math.round((data[idx]/255)*30))+"px"});state.featuredWaveFrame=requestAnimationFrame(frame)};
  cancelAnimationFrame(state.featuredWaveFrame);state.featuredWaveFrame=requestAnimationFrame(frame);
}
/* =========================================================
   REAL BENTO HOMEPAGE DATA — no slider dependency
   ========================================================= */
async function bentoReadMusicDb(name){
  return readRealMusicStore(name,name===REAL_MUSIC_DB?REAL_MUSIC_STORE:MUSIC_STORE);
}
async function bentoMusicRows(){
  return getRealMusic();
}
function countFreshPresence(){
  const now=Date.now();
  const ONLINE_WINDOW_MS=45000;
  const online=new Set();
  livePresenceDocs.forEach(row=>{
    const x=row?.data||{};
    const lastSeenMs=typeof x.lastSeen?.toMillis==="function"
      ? x.lastSeen.toMillis()
      : Number.isFinite(Number(x.lastSeen)) ? Number(x.lastSeen) : 0;
    if(x.online===true && lastSeenMs>0 && (now-lastSeenMs)<=ONLINE_WINDOW_MS){
      online.add(row.id||x.uid);
    }
  });
  return online.size;
}
async function bentoOnlineCount(){
  if(livePresenceDocs.length)return countFreshPresence();
  try{
    const snap=await getDocs(query(collection(db,"presence"),limit(500)));
    const now=Date.now();
    const ONLINE_WINDOW_MS=45000;
    const online=new Set();
    snap.forEach(s=>{
      const x=s.data()||{};
      const lastSeenMs=typeof x.lastSeen?.toMillis==="function"
        ? x.lastSeen.toMillis()
        : Number.isFinite(Number(x.lastSeen)) ? Number(x.lastSeen) : 0;
      if(x.online===true && lastSeenMs>0 && (now-lastSeenMs)<=ONLINE_WINDOW_MS){
        online.add(s.id||x.uid);
      }
    });
    return online.size;
  }catch(_){return null}
}
function renderLiveOnlineCount(){
  const count=countFreshPresence();
  const el=$("#bentoOnlineUsers");
  if(el)el.textContent=String(count);
  const live=$("#bentoSystemNote");
  if(live){
    const now=new Date();
    const stamp=now.toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit",second:"2-digit"});
    live.textContent="LIVE • Firebase presence • Updated "+stamp;
  }
}
function startLivePresence(){
  if(livePresenceUnsubscribe)return;
  const presenceQuery=query(collection(db,"presence"),limit(500));
  livePresenceUnsubscribe=onSnapshot(presenceQuery,snap=>{
    livePresenceDocs=snap.docs.map(docSnap=>({id:docSnap.id,data:docSnap.data()||{}}));
    renderLiveOnlineCount();
  },error=>{
    console.warn("[TUBAL HUB live presence]",error);
    livePresenceDocs=[];
    const live=$("#bentoSystemNote");
    if(live)live.textContent="LIVE • Presence unavailable";
  });
  renderLiveOnlineCount();
}
function bentoJournalItems(){
  return getRealJournalViews().slice(0,3);
}
function bentoRenderJournal(){
  renderPayapangIsip();
}
function bentoMusicCover(track){
  const seed=String(track?.id||track?.title||"music"),hash=[...seed].reduce((n,ch)=>n+ch.charCodeAt(0),0),h1=hash%360,h2=(h1+86)%360;
  return "linear-gradient(135deg,hsl("+h1+" 75% 55%),hsl("+h2+" 65% 42%))";
}
function getBentoShopCount(key){
  try{
    const value=JSON.parse(localStorage.getItem(key)||"[]");
    return Array.isArray(value)?value.length:0;
  }catch(_){return 0}
}
function bentoRenderShop(){
  const box=$("#bentoShopList");if(!box)return;
  const collections=[
    {id:"th",icon:"◈",title:"TUBAL HUB",sub:"Official hub collection"},
    {id:"payapang",icon:"🌿",title:"PAYAPANG ISIP",sub:"Calm collection"},
    {id:"ctrlzone",icon:"◈",title:"CTRLZONE",sub:"Gaming collection"}
  ];
  box.innerHTML=collections.map(item=>
    '<a class="collection-card" href="pages/shop.html#'+item.id+'"><span class="collection-card-icon">'+item.icon+'</span><span class="collection-card-title">'+item.title+'</span><span class="collection-card-sub">'+item.sub+'</span><span class="collection-card-arrow">→</span></a>'
  ).join("");
  const cart=getBentoShopCount("tubalhub-shop-cart-v1");
  const cartEl=$("#cartCountReal")||$("#bentoShopCart");
  if(cartEl)cartEl.textContent=cart+" "+(cart===1?"item":"items");
  const wishEl=$("#bentoShopWishlist");if(wishEl)wishEl.textContent=String(getBentoShopCount("tubalhub-shop-wishlist-v1"));
}

function normalizeHomeHubPost(p){
  return {
    id:String(p?.id||""),
    author:String(p?.authorName||"Member"),
    avatar:String(p?.authorPhotoURL||""),
    text:String(p?.text||p?.title||"").trim(),
    image:String(p?.imageUrl||""),
    likes:Number(p?.likes||0),
    comments:Number(p?.comments||0),
    createdAt:p?.createdAt?.toMillis?.()||p?.createdAt?.seconds*1000||Date.now()
  };
}
function startHomeCommunityFeed(){
  if(liveHubPostsUnsubscribe)return;
  try{
    liveHubPostsUnsubscribe=subscribeHubPosts(items=>{
      liveHubPosts=items
        .filter(p=>p?.status!=="draft")
        .map(normalizeHomeHubPost)
        .filter(p=>p.text||p.image)
        .slice(0,20);
      bentoRenderFeeds(liveHubPosts);
      const countEl=$("#bentoFeedsCount");
      if(countEl)countEl.textContent=String(liveHubPosts.length);
      const heroCount=$("#bentoFeedsLiveCount");
      if(heroCount)heroCount.textContent=liveHubPosts.length+" "+(liveHubPosts.length===1?"post":"posts");
    });
  }catch(error){
    console.warn("[TUBAL HUB community feed]",error);
  }
}
function bentoRenderFeeds(rows){
  const box=$("#bentoFeedsList");if(!box)return;
  const countEl=$("#bentoFeedsLiveCount");
  if(countEl)countEl.textContent=rows.length+" "+(rows.length===1?"post":"posts");
  if(!rows.length){
    renderRealFeedsEmptyState(box);
    return;
  }
  const first=rows[0],rest=rows.slice(1,4);
  const avatarMarkup=p=>{
    const avatar=p.avatar||"";
    const letter=String(p.author||"U").trim().charAt(0).toUpperCase()||"U";
    return '<span class="bento-feed-avatar">'+(avatar?'<img src="'+esc(avatar)+'" alt="" loading="lazy">':esc(letter))+'</span>';
  };
  const imageMarkup=p=>p.image?'<img class="bento-feed-image" src="'+esc(p.image)+'" alt="" loading="lazy">':"";
  const featured='<article class="bento-feed-featured">'+
    '<div class="bento-feed-head">'+avatarMarkup(first)+'<div class="bento-feed-author"><strong>'+esc(first.author||"Member")+'</strong><small>'+esc(formatDate(first.createdAt))+'</small></div><span class="bento-feed-real-badge">REAL</span></div>'+
    '<p class="bento-feed-featured-text">'+esc(first.text||"")+'</p>'+imageMarkup(first)+
    '<div class="bento-feed-foot"><span class="bento-like-value">'+Math.max(0,Number(first.likes||0))+' likes • '+Math.max(0,Number(first.comments||0))+' comments</span><a class="bento-feed-open" href="pages/feeds.html">View post →</a></div></article>';
  const compact=rest.map(p=>'<article class="bento-feed-compact">'+
    avatarMarkup(p)+'<div class="bento-feed-compact-copy"><div class="bento-feed-compact-top"><strong>'+esc(p.author||"Member")+'</strong><small>'+esc(formatDate(p.createdAt))+'</small></div>'+
    '<p>'+esc(String(p.text||"").slice(0,120))+(String(p.text||"").length>120?"…":"")+'</p>'+
    '<span>'+Math.max(0,Number(p.likes||0))+' likes • '+Math.max(0,Number(p.comments||0))+' comments</span></div></article>').join("");
  box.innerHTML=featured+(compact?'<div class="bento-feed-more-list">'+compact+'</div>':"");
}
function getRealGameInitials(game){
  const source=String(game.titleReal||game.title||'Game').trim();
  const words=source.split(/\s+/).filter(Boolean);
  return (words.length>1?words.slice(0,2).map(w=>w[0]).join(''):source.slice(0,2)).toUpperCase();
}
function realGameLogoMarkup(game){
  const logo=String(game.logoReal||'').trim();
  const hd=String(game.logoRealHD||'').trim();
  if(logo){
    return '<img class="game-card-real-logo-img" src="'+esc(logo)+'"'+(hd?' srcset="'+esc(hd)+' 2x"':'')+' alt="'+esc(game.titleReal)+' official logo" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="game-real-initials" hidden>'+esc(getRealGameInitials(game))+'</span>';
  }
  return '<span class="game-real-initials">'+esc(getRealGameInitials(game))+'</span>';
}
function getRealGameHref(game){
  const link=String(game.linkReal||'').trim();
  return link?link:'pages/ctrlzone.html?game='+encodeURIComponent(String(game.id||''));
}
let realFeaturedGames=[];
let realFeaturedIndex=0;
let realFeaturedTimer=null;
function renderFeaturedGamesRealLogo(games=featuredGames){
  const track=document.getElementById('featuredGamesTrackReal');
  const countEl=document.getElementById('currentCatalogCount');
  if(!track)return;
  realFeaturedGames=Array.isArray(games)?games.filter(g=>g&&g.idReal&&g.titleReal):[];
  if(countEl)countEl.textContent=realFeaturedGames.length+' '+(realFeaturedGames.length===1?'game':'games')+' real';
  if(!realFeaturedGames.length){
    track.innerHTML='<div class="empty-games-real"><div class="empty-real-mark" aria-hidden="true">NO LOGO</div><p>Wala pang real games na may logo file.</p><small>Mag-upload ng official PNG sa /assets/games/logos/ at ilagay ang logoReal path sa /data/games.json.</small></div>';
    clearInterval(realFeaturedTimer);
    return;
  }
  const visible=realFeaturedGames.slice(0,4).map((_,i)=>realFeaturedGames[(realFeaturedIndex+i)%realFeaturedGames.length]);
  track.innerHTML=visible.map(game=>{
    const href=getRealGameHref(game);
    return '<a class="game-card-real-logo" href="'+esc(href)+'"><div class="game-real-logo-box">'+realGameLogoMarkup(game)+'</div><b>'+esc(game.titleReal)+'</b><small>'+esc(game.devReal||'')+'</small><span class="real-logo-badge">REAL LOGO</span></a>';
  }).join('');
}
function startFeaturedGamesRealRotation(){
  clearInterval(realFeaturedTimer);
  if(realFeaturedGames.length<=4)return;
  realFeaturedTimer=setInterval(()=>{
    realFeaturedIndex=(realFeaturedIndex+1)%realFeaturedGames.length;
    renderFeaturedGamesRealLogo(realFeaturedGames);
  },4500);
}
function bentoRenderGames(){
  renderFeaturedGamesRealLogo(featuredGames);
  startFeaturedGamesRealRotation();
}
async function renderRealData(){
  migrateRealJournalStorage();
  clearRealAudioUrls();
  const [music,games,online]=await Promise.all([getRealMusic(),getRealGames(),bentoOnlineCount()]);
  const journals=getRealJournalViews();
  const posts=liveHubPosts.length?liveHubPosts:getRealFeeds();
  featuredGames=games;
  bentoRenderJournal();
  bentoRenderShop();
  bentoRenderGames();
  bentoRenderFeeds(posts);
  renderFeaturedWebsiteData(journals,music,posts,games);
  loadRealPageTitle("pages/payapang-isip.html","#featuredPeaceTitle");
  loadRealPageTitle("pages/ai-music.html","#featuredMusicTitle");
  loadRealPageTitle("pages/ctrlzone.html","#featuredGamesTitle");
  loadRealPageTitle("pages/feeds.html","#featuredFeedsTitle");
  const setText=(sel,value)=>{const el=$(sel);if(el)el.textContent=String(value)};
  setText("#bentoOnlineUsers",online===null?"—":online);
  setText("#bentoJournalCount",journals.length);
  setText("#bentoMusicCount",music.length);
  setText("#bentoGamesCount",games.length);
  setText("#bentoFeedsCount",posts.length);
}
async function loadBentoVersion(){
  try{
    const response=await fetch(new URL("version.json?v=1.2.16&t="+Date.now(),document.baseURI).href,{cache:"no-store"});
    if(!response.ok)throw new Error("version "+response.status);
    const data=await response.json();
    const version=String(data?.version||"").trim();
    const el=$("#bentoVersion");
    if(el)el.textContent=version?("v"+version):"—";
  }catch(_){
    const el=$("#bentoVersion");if(el)el.textContent="—";
  }
}
function initBento(){
  const refresh=()=>renderRealData().catch(e=>console.warn("[TUBAL HUB real data]",e));
  refresh();
  loadBentoVersion();
  startLivePresence();
  clearInterval(liveStatsTimer);
  liveStatsTimer=setInterval(()=>{
    renderLiveOnlineCount();
    refresh();
  },5000);
  window.addEventListener("tubalhub-real-data-update",refresh);
  window.addEventListener("storage",event=>{
    const key=event.key||"";
    if(key===REAL_JOURNAL_KEY||key===LEGACY_JOURNAL_KEY||key===REAL_FEED_KEY||key===PLAYS_KEY||key===GAMES_KEY||(key.startsWith("play_")&&key.endsWith("_real")))refresh();
  });
  window.addEventListener("focus",refresh,{passive:true});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
}


/* =========================================================
   TUBAL HUB FEEDS BODY — REAL RENDER
   ========================================================= */
function renderFeedsBodyReal(){
  const real=getRealFeeds();
  const track=document.getElementById("feedsInsideTrack");
  const count=document.getElementById("feedCountReal");
  const quickCount=document.getElementById("quickPostCount");
  if(count)count.textContent=real.length+" "+(real.length===1?"post":"posts");
  if(quickCount)quickCount.textContent=real.length+" posts real";
  if(!track)return;
  if(real.length===0){
    track.innerHTML='<div class="real-empty-feed">Wala pa real post — mag post sa kanan</div>';
    return;
  }
  track.innerHTML=real.slice(0,10).map(p=>{
    const image=String(p.imageReal||p.imgReal||p.image||"").trim();
    const user=String(p.userReal||p.author||"Ikaw").trim()||"Ikaw";
    const text=String(p.textReal||p.text||"").trim();
    const created=p.createdAtReal||p.createdAt||"";
    const date=created?new Date(created):null;
    const dateText=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString("en-PH"):"";
    const avatar=String(p.avatarReal||p.avatar||"").trim();
    return '<div class="feed-item glass">'+
      (avatar?'<img src="'+esc(avatar)+'" alt="" loading="lazy">':(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'<span aria-hidden="true" style="width:32px;height:32px;min-width:32px;border-radius:50%;display:block;background:linear-gradient(135deg,#1dff91,#7d5aff);"></span>'))+
      '<div class="feed-copy"><b>'+esc(user)+'</b><p>'+esc(text)+'</p><small>'+esc(dateText)+'</small></div>'+
    '</div>';
  }).join("");
}
async function saveFeedsBodyQuickPostReal(){
  const input=document.getElementById("realPostInput");
  const fileInput=document.getElementById("realPostImage");
  const text=String(input?.value||"").trim();
  const file=fileInput?.files?.[0]||null;
  if(!text){showHomeToast("Lagyan muna ng totoong post.");input?.focus();return}
  if(file&&file.size>8*1024*1024){showHomeToast("Image must be 8 MB or smaller.");return}
  try{
    const user=auth.currentUser;
    const imageReal=await saveRealFeedImage(file);
    const feeds=getRealFeeds();
    feeds.unshift({
      idReal:window.crypto?.randomUUID?window.crypto.randomUUID():"local-"+Date.now(),
      textReal:text,imageReal:imageReal||"",createdAtReal:new Date().toISOString(),
      userReal:user?.displayName||user?.email||localStorage.getItem("tubal_username")||"Ikaw",likesReal:0
    });
    localStorage.setItem("tubalhub_feeds",JSON.stringify(feeds));
    if(input)input.value="";
    if(fileInput)fileInput.value="";
    renderFeedsBodyReal();
    renderRealData();
    emitRealDataUpdate();
    showHomeToast("Real post saved.");
  }catch(error){
    console.warn("[TUBAL HUB quick feed]",error);
    showHomeToast("Hindi na-save ang real post.");
  }
}
function initFeedsBodyReal(){
  const save=document.getElementById("saveRealPostBtn");
  const file=document.getElementById("realPostImage");
  save?.addEventListener("click",saveFeedsBodyQuickPostReal);
  file?.addEventListener("change",()=>{
    const label=file.closest("label")?.querySelector("span:last-of-type");
    if(label)label.textContent=file.files?.[0]?.name||"optional";
  });
  renderFeedsBodyReal();
}

function initRealBentoSpotlight(){
  document.querySelectorAll(".glass-card-real").forEach(card=>{
    if(card.dataset.spotlightReady==="1")return;
    card.dataset.spotlightReady="1";
    card.addEventListener("mousemove",e=>{
      const rect=card.getBoundingClientRect();
      card.style.setProperty("--mx",(e.clientX-rect.left)+"px");
      card.style.setProperty("--my",(e.clientY-rect.top)+"px");
    },{passive:true});
  });
}

function initHomeVersionWatcherBridge(){
  if(window.tubalHubVersionChecker?.start){
    window.tubalHubVersionChecker.start();
  }
}
function init(){
  initHomeVersionWatcherBridge();
  initFeedsBodyReal();
  initHubHeroMessages();
  startHomeCommunityFeed();
  initRealBentoSpotlight();
  initSpotlight();
  initBento();
  initFeaturedWebsiteSlider();
  initFooter();
  initRealEmailSubscribe();
  initSponsoredReal();
  initFooterNewsletter();
  initFooterSmoothLinks();
  initScrollReveal();

  const homeAudio=$("#homeMusicAudio");
  if(homeAudio){
    homeAudio.addEventListener("play",()=>{
      const id=state.selectedMusic?.id;
      if(!id)return;
      const countedFor=homeAudio.dataset.realPlayCountedId||"";
      if(countedFor===String(id))return;
      homeAudio.dataset.realPlayCountedId=String(id);
      incrementRealMusicPlay(id);
      updateRealMusicPlayCounts();
    });
    homeAudio.addEventListener("ended",()=>{
      homeAudio.dataset.realPlayCountedId="";
      document.querySelectorAll(".music-real-card.is-playing,.bento-music-item.is-playing,.featured-track-item.is-playing").forEach(card=>card.classList.remove("is-playing"));
      $("#featuredTrack > .featured-slide:nth-child(2)")?.classList.remove("is-playing");
      showHomeToast("Audio finished.");
    });
  }

  addEventListener("beforeunload",()=>{
    clearInterval(liveStatsTimer);
    livePresenceUnsubscribe?.();
    livePresenceUnsubscribe=null;
    liveHubPostsUnsubscribe?.();
    liveHubPostsUnsubscribe=null;
    clearInterval(hubMessageTimer);
    cleanup();
  });
  runRealDataAudit().catch(()=>{});

  document.addEventListener("click",event=>{
    const game=event.target.closest?.("[data-real-game-play]");
    if(!game)return;
    event.preventDefault();
    playRealGame(game.dataset.realGamePlay);
  });
}
let homeStarted=false;
let lastHomeMobile=window.innerWidth<=768;
let resizeTimer=0;

function handleHomeBreakpoint(){
  const nowMobile=window.innerWidth<=768;
  if(nowMobile===lastHomeMobile)return;
  lastHomeMobile=nowMobile;
  renderJournal();
  loadMusic();
  renderFeeds();
  loadFeaturedGames();
  requestAnimationFrame(renderAllSliderDots);
}

addEventListener("resize",()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(handleHomeBreakpoint,140);
},{passive:true});

function syncHomeAuthUI(user){
  const guest=$("#authGuestActions");
  const signed=$("#authUserActions");
  const name=$("#authUserName");
  const sidebarUser=$("#sidebarUser");
  const sidebarName=$("#sidebarUserName");
  const sidebarAvatar=$("#sidebarUserAvatar");
  const logout=$("#logoutBtn");
  const loggedIn=Boolean(user);
  const displayName=String(user?.displayName||user?.email?.split("@")[0]||(user?.isAnonymous?"Guest":"")).trim();

  if(guest){
    guest.hidden=loggedIn;
    guest.style.display=loggedIn?"none":"flex";
    guest.setAttribute("aria-hidden",loggedIn?"true":"false");
  }
  if(signed){
    signed.hidden=!loggedIn;
    signed.style.display=loggedIn?"flex":"none";
    signed.setAttribute("aria-hidden",loggedIn?"false":"true");
  }
  if(name)name.textContent=loggedIn?displayName:"";
  if(logout)logout.setAttribute("aria-label",loggedIn?"Log out "+displayName:"Logout");
  if(sidebarUser){
    sidebarUser.hidden=!loggedIn;
    sidebarUser.style.display=loggedIn?"flex":"none";
    sidebarUser.setAttribute("aria-hidden",loggedIn?"false":"true");
  }
  if(sidebarName)sidebarName.textContent=loggedIn?displayName:"";
  if(sidebarAvatar)sidebarAvatar.textContent=(displayName.charAt(0)||"U").toUpperCase();
}

function startHome(){
  if(homeStarted)return;
  homeStarted=true;
  const logout=$("#logoutBtn");
  logout?.addEventListener("click",async()=>{
    try{
      const {signOut}=await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
      await signOut(auth);
    }catch(error){
      console.error("Logout failed:",error);
    }
  });
  const applyAuthUI=()=>syncHomeAuthUI(auth.currentUser);
  applyAuthUI();
  try{
    auth.authStateReady?.().then(applyAuthUI).catch(()=>{});
  }catch(_){}
  onAuthStateChanged(auth,user=>{
    syncHomeAuthUI(user);
  });
  init();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",startHome,{once:true});
}else{
  startHome();
}


/* =========================================================
   REAL ADVERTISEMENT — remote/local data only, no mock ads
   ========================================================= */
(function initRealAdvertisements(){
  const ADS_LOCAL_KEY="tubalhub_ads";
  const ADS_AUTOPLAY_KEY="tubalhub_ads_autoplay";
  const state={ads:[],index:0,timer:null,paused:false,hovered:false,dragStartX:0,dragStartScroll:0,dragging:false,skipTimers:new Map()};
  const $id=id=>document.getElementById(id);
  const escAd=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const realHref=value=>{const href=String(value||"").trim();if(!href)return"#";return /^(https?:|mailto:|tel:|\/|\.\.?\/|#)/i.test(href)?href:"#"};
  const realText=value=>String(value??"").trim();

  function getRealAds(){
    const local=(()=>{try{const value=JSON.parse(localStorage.getItem(ADS_LOCAL_KEY)||"[]");return Array.isArray(value)?value:[]}catch(_){return[]}})();
    return fetch("data/ads.json?v=1.2.16&t="+Date.now(),{cache:"no-store"})
      .then(r=>r.ok?r.json():[])
      .catch(()=>[])
      .then(remote=>{
        const rows=Array.isArray(remote)?remote:(Array.isArray(remote?.ads)?remote.ads:[]);
        return rows.length?rows:local;
      });
  }

  function trackAdClick(ad){
    if(!ad?.id)return;
    try{localStorage.setItem("ad_click_"+String(ad.id)+"_real",String(Date.now()))}catch(_){ }
    window.dispatchEvent(new CustomEvent("tubalhub-ad-click",{detail:{id:ad.id,type:ad.type||"unknown"}}));
  }

  function adCardHtml(ad){
    const title=realText(ad.titleReal||ad.title||"Sponsored");
    const desc=realText(ad.descReal||ad.desc||"");
    const price=realText(ad.priceReal||ad.price||"");
    const image=realText(ad.imageReal||ad.image||"");
    const link=realHref(ad.linkReal||ad.link);
    const type=realText(ad.type).toLowerCase();
    if(type==="banner")return '<article class="ad-card ad-banner" data-ad-id="'+escAd(ad.id)+'" data-ad-link="'+escAd(link)+'" style="background:'+(escAd(ad.bgReal||"linear-gradient(135deg,#1dff91,#7d5aff)"))+'"><div class="ad-banner-copy"><span class="ad-card-kicker">Sponsored</span><h3>'+escAd(title)+'</h3><p>'+escAd(desc)+'</p><button type="button">'+escAd(realText(ad.ctaReal||ad.cta||"Learn More"))+'</button></div><span class="ad-banner-emoji" aria-hidden="true">📢</span></article>';
    if(type==="video")return '<article class="ad-video" data-ad-id="'+escAd(ad.id)+'" data-ad-link="'+escAd(link)+'"><video class="ad-video-el" muted autoplay loop playsinline preload="metadata" poster="'+escAd(realText(ad.posterReal||ad.poster||""))+'" src="'+escAd(realText(ad.videoReal||ad.video||""))+'"></video><div class="ad-video-overlay"><div class="ad-video-copy"><strong>'+escAd(title)+'</strong><span>'+escAd(desc)+'</span></div><button class="ad-video-skip" type="button" data-ad-skip="'+escAd(ad.id)+'">Skip <b>5</b></button></div></article>';
    return '<article class="ad-card" data-ad-id="'+escAd(ad.id)+'" data-ad-link="'+escAd(link)+'" style="background:'+(escAd(ad.bgReal||"rgba(255,255,255,.045)"))+'"><div class="ad-card-media">'+(image?'<img src="'+escAd(image)+'" alt="'+escAd(title)+'" loading="lazy" decoding="async">':'<span class="ad-card-media-emoji" aria-hidden="true">'+escAd(realText(ad.emojiReal||ad.emoji||"📢"))+'</span>')+'</div><div class="ad-card-body"><span class="ad-card-kicker">Sponsored</span><h4>'+escAd(title)+'</h4><p>'+escAd(desc)+'</p><div class="ad-card-bottom">'+(price?'<span class="ad-card-price">'+escAd(price)+'</span>':'<span></span>')+'<button class="ad-card-cta" type="button">'+escAd(realText(ad.ctaReal||ad.cta||"Open"))+'</button></div></div></article>';
  }

  function renderDots(){
    const dots=$id("adsDots");if(!dots)return;
    dots.innerHTML=state.ads.map((ad,i)=>'<button class="ads-dot '+(i===state.index?"active":"")+'" type="button" role="tab" aria-label="Advertisement '+(i+1)+'" aria-selected="'+(i===state.index?"true":"false")+'" data-ad-dot="'+i+'"></button>').join("");
  }
  function centerSlide(index,behavior="smooth"){
    const track=$id("adsTrack");if(!track||!state.ads.length)return;
    state.index=Math.max(0,Math.min(state.ads.length-1,index));
    const slide=track.children[state.index];
    if(slide){const left=slide.offsetLeft-(track.clientWidth-slide.offsetWidth)/2;track.scrollTo({left:Math.max(0,left),behavior})}
    renderDots();
  }
  function syncIndexFromScroll(){
    const track=$id("adsTrack");if(!track||!state.ads.length)return;
    const center=track.scrollLeft+track.clientWidth/2;let best=0,bestDist=Infinity;
    [...track.children].forEach((slide,i)=>{const d=Math.abs((slide.offsetLeft+slide.offsetWidth/2)-center);if(d<bestDist){best=i;bestDist=d}});
    if(best!==state.index){state.index=best;renderDots()}
  }
  function clearAdTimer(){if(state.timer){clearInterval(state.timer);state.timer=null}}
  function startAdTimer(){clearAdTimer();if(state.paused||state.hovered||state.ads.length<2)return;state.timer=setInterval(()=>{if(!state.paused&&!state.hovered)centerSlide((state.index+1)%state.ads.length)},5000)}
  function setPaused(paused){state.paused=paused;const btn=$id("adsAutoplay");if(btn){btn.classList.toggle("is-paused",paused);btn.setAttribute("aria-pressed",paused?"false":"true");btn.setAttribute("aria-label",paused?"Resume advertisement autoplay":"Pause advertisement autoplay");const label=btn.querySelector("span");if(label)label.textContent=paused?"Autoplay paused":"Auto-play 5s"}startAdTimer()}
  function bindVideoCountdown(card,ad){
    const btn=card.querySelector("[data-ad-skip]");if(!btn)return;
    let remaining=5;btn.innerHTML="Skip <b>"+remaining+"</b>";
    const old=state.skipTimers.get(ad.id);if(old)clearInterval(old);
    const timer=setInterval(()=>{remaining-=1;btn.innerHTML=remaining>0?"Skip <b>"+remaining+"</b>":"Skip";if(remaining<=0){clearInterval(timer);state.skipTimers.delete(ad.id)}},1000);
    state.skipTimers.set(ad.id,timer);
    const video=card.querySelector("video");video?.play?.().catch(()=>{});
    btn.addEventListener("click",e=>{e.stopPropagation();video?.pause?.();card.remove()},{once:true});
  }
  function renderAdsReal(){
    getRealAds().then(real=>{
      state.ads=real.filter(ad=>ad&&ad.id&&["banner","square","video"].includes(String(ad.type||"").toLowerCase()));
      const track=$id("adsTrack");if(!track)return;
      if(!state.ads.length){track.innerHTML='<div class="ads-empty"><div><strong>No sponsored ads available</strong><small>Real ads will appear here when ad data is published.</small></div></div>';renderDots();clearAdTimer();return}
      track.innerHTML=state.ads.map(adCardHtml).join("");
      state.index=0;renderDots();centerSlide(0,"auto");startAdTimer();
      [...track.children].forEach((card,i)=>{const ad=state.ads[i];if(String(ad.type).toLowerCase()==="video")bindVideoCountdown(card,ad)});
    }).catch(error=>{console.warn("[TUBAL HUB real ads]",error)})
  }

  function init(){
    const track=$id("adsTrack"),wrapper=$id("adsTrackWrapper");if(!track||!wrapper)return;
    $id("adsPrev")?.addEventListener("click",()=>centerSlide((state.index-1+state.ads.length)%state.ads.length));
    $id("adsNext")?.addEventListener("click",()=>centerSlide((state.index+1)%state.ads.length));
    $id("adsAutoplay")?.addEventListener("click",()=>setPaused(!state.paused));
    $id("adsDots")?.addEventListener("click",e=>{const dot=e.target.closest?.("[data-ad-dot]");if(dot)centerSlide(Number(dot.dataset.adDot))});
    track.addEventListener("scroll",()=>{requestAnimationFrame(syncIndexFromScroll)},{passive:true});
    wrapper.addEventListener("mouseenter",()=>{state.hovered=true;clearAdTimer()});
    wrapper.addEventListener("mouseleave",()=>{state.hovered=false;startAdTimer()});
    wrapper.addEventListener("focusin",()=>clearAdTimer());wrapper.addEventListener("focusout",()=>{if(!state.hovered)startAdTimer()});
    track.addEventListener("pointerdown",e=>{state.dragStartX=e.clientX;state.dragStartScroll=track.scrollLeft;state.dragging=true;track.setPointerCapture?.(e.pointerId)});
    track.addEventListener("pointermove",e=>{if(!state.dragging)return;const dx=e.clientX-state.dragStartX;if(Math.abs(dx)>=1)track.scrollLeft=state.dragStartScroll-dx},{passive:true});
    const endDrag=e=>{if(!state.dragging)return;state.dragging=false;const dx=e.clientX-state.dragStartX;if(Math.abs(dx)>=50){centerSlide(dx<0?state.index+1:state.index-1)}else syncIndexFromScroll()};
    track.addEventListener("pointerup",endDrag);track.addEventListener("pointercancel",endDrag);track.addEventListener("lostpointercapture",()=>{state.dragging=false});
    track.addEventListener("click",e=>{
      if(state.dragging)return;
      const card=e.target.closest?.("[data-ad-id]");if(!card)return;
      if(e.target.closest?.("button")){
        if(e.target.closest?.(".ad-card-cta")||e.target.closest?.(".ad-banner button")){const ad=state.ads.find(x=>String(x.id)===String(card.dataset.adId));if(ad){trackAdClick(ad);location.href=realHref(ad.linkReal||ad.link)}}
        return;
      }
      const ad=state.ads.find(x=>String(x.id)===String(card.dataset.adId));if(ad){trackAdClick(ad);const href=realHref(ad.linkReal||ad.link);if(href!=="#")location.href=href}
    });
    renderAdsReal();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

function getRealFeedsCompat(){
  try{return JSON.parse(localStorage.getItem('tubalhub_feeds')||'[]')}catch{return []}
}
function getRealCartCompat(){
  try{return JSON.parse(localStorage.getItem('tubalhub_cart_real')||'[]')}catch{return []}
}
function renderAllReal(){
  const journals=getRealJournals();
  const jEmpty=document.getElementById('journalEmptyReal');
  if(jEmpty)jEmpty.style.display=journals.length?'none':'flex';

  const feeds=getRealFeedsCompat();
  document.querySelectorAll('#feedCountReal,#latestCount,#bentoFeedsLiveCount').forEach(el=>{
    el.textContent=feeds.length+' '+(feeds.length===1?'post':'posts');
  });

  const cart=getRealCartCompat();
  const cartEl=document.getElementById('cartCountReal');
  if(cartEl)cartEl.textContent=cart.length+' '+(cart.length===1?'item':'items')+' real';

  fetch('data/games.json?v=1.2.16&t='+Date.now(),{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('games.json '+r.status);return r.json()})
    .then(games=>{
      const rows=Array.isArray(games)?games:(Array.isArray(games.games)?games.games:[]);
      const el=document.getElementById('currentCatalogCount')||document.getElementById('bentoGamesLiveCount');
      if(el)el.textContent=rows.length+' '+(rows.length===1?'game':'games')+' real';
    })
    .catch(()=>{
      const el=document.getElementById('currentCatalogCount')||document.getElementById('bentoGamesLiveCount');
      if(el)el.textContent='0 games real — add to /data/games.json';
    });
}

/* =========================================================
   REAL SYSTEM UPDATE DETECTOR
   Reads version.json as the single source of truth and shows a slide-in changelog when
   the deployed version changes.
   ========================================================= */
let lastVersionReal = localStorage.getItem('tubalhub_version_real') || '0.0.0';
let lastCheckReal = 0;
let systemUpdatePendingReal = null;

const allowedUpdateTypesReal = new Set(['UI','STYLE','FEAT','FIX','PERF','BUILD']);

function escSystemUpdateReal(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

function colorForUpdateTypeReal(type){
  const colors = {
    UI:'#7d5aff',
    STYLE:'#ff9a3d',
    FEAT:'#1dff91',
    FIX:'#62b6ff',
    PERF:'#ffd166',
    BUILD:'#c8a6ff'
  };
  return colors[type] || '#1dff91';
}

function updateContainerShowReal(){
  const cont=document.getElementById('systemUpdateContainer');
  if(!cont)return;
  cont.classList.add('is-visible');
  cont.setAttribute('aria-hidden','false');
}

function hideSystemUpdateContainerReal(){
  const cont=document.getElementById('systemUpdateContainer');
  if(!cont)return;
  cont.classList.remove('is-visible');
  cont.setAttribute('aria-hidden','true');
}

function renderSystemUpdateListReal(data){
  const list=document.getElementById('updateListReal');
  const badge=document.getElementById('updateVersionBadgeReal');
  const timeEl=document.getElementById('updateTimeReal');
  if(!list)return;

  const updates=Array.isArray(data?.updatesReal) ? data.updatesReal : [];
  if(badge) badge.textContent='v'+String(data?.version||'—');
  if(timeEl){
    const released=String(data?.releasedAtReal||'').trim();
    if(released){
      const date=new Date(released);
      timeEl.textContent=Number.isNaN(date.getTime())
        ? 'just now'
        : date.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'});
    }else{
      timeEl.textContent='just now';
    }
  }

  list.innerHTML=updates.map(item=>{
    const typeRaw=String(item?.typeReal||'FIX').toUpperCase();
    const type=allowedUpdateTypesReal.has(typeRaw)?typeRaw:'FIX';
    const color=colorForUpdateTypeReal(type);
    const scope=escSystemUpdateReal(item?.scopeReal||'Site');
    const detail=escSystemUpdateReal(item?.detailReal||'Updated');
    const icon=escSystemUpdateReal(item?.iconReal||'🔧');

    return '<article class="system-update-item-real">'+
      '<div class="system-update-item-icon-real" style="background:'+color+'1f">'+icon+'</div>'+
      '<div class="system-update-item-copy-real">'+
        '<div class="system-update-item-title-real">'+
          '<span class="system-update-type-real" style="background:'+color+'">'+type+'</span>'+
          '<b>'+scope+'</b>'+
        '</div>'+
        '<p>'+detail+'</p>'+
      '</div>'+
    '</article>';
  }).join('');

  if(!updates.length){
    list.innerHTML='<div class="system-update-empty-real">Walang changelog entries sa version.json.</div>';
  }
}

function showSystemUpdateContainerReal(data){
  if(!data?.version)return;
  systemUpdatePendingReal=data;
  renderSystemUpdateListReal(data);
  try{
    localStorage.setItem('tubalhub_pending_update_real',JSON.stringify({
      ver:String(data.version),
      time:Date.now(),
      data
    }));
  }catch(_){}
  updateContainerShowReal();
  try{
    if(navigator.vibrate)navigator.vibrate([200,100,200,100,200]);
  }catch(_){}
}

function semverPartsReal(value){
  const parts=String(value||'0.0.0').split('.').map(n=>parseInt(n,10));
  return [Number.isFinite(parts[0])?parts[0]:0,Number.isFinite(parts[1])?parts[1]:0,Number.isFinite(parts[2])?parts[2]:0];
}

function isVersionNewerReal(remote,local){
  const a=semverPartsReal(remote),b=semverPartsReal(local);
  for(let i=0;i<3;i++){
    if(a[i]>b[i])return true;
    if(a[i]<b[i])return false;
  }
  return String(remote)!==String(local);
}

async function detectSystemUpdateReal(force=false){
  const now=Date.now();
  if(!force && now-lastCheckReal<3000)return;
  lastCheckReal=now;
  try{
    const res=await fetch('version.json?v=1.2.16&t='+Date.now(),{
      cache:'no-store',
      headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}
    });
    if(!res.ok)return;
    const data=await res.json();
    const remoteVer=String(data?.version||'').trim();
    if(!remoteVer)return;

    const notified=localStorage.getItem('tubalhub_notified_ver_real')||'';
    const versionChanged=isVersionNewerReal(remoteVer,lastVersionReal) || remoteVer!==lastVersionReal;

    if((versionChanged || force) && (notified!==remoteVer || force)){
      showSystemUpdateContainerReal(data);
      await notifySubscribersOnUpdateReal(data);
      localStorage.setItem('tubalhub_notified_ver_real',remoteVer);
    }

    localStorage.setItem('tubalhub_version_real',remoteVer);
    lastVersionReal=remoteVer;

    const liveVersion=document.getElementById('liveVersion');
    if(liveVersion)liveVersion.textContent='v'+remoteVer;
    const bentoVersion=document.getElementById('bentoVersion');
    if(bentoVersion)bentoVersion.textContent='v'+remoteVer;
  }catch(e){
    console.log('[TUBAL HUB system update check]',e);
  }
}

async function loadLatestVersionReal(){
  const data=systemUpdatePendingReal;
  const badge=document.getElementById("updateVersionBadgeReal");
  const targetVersion=String(data?.version||badge?.textContent||"1.2.16").replace(/^v/i,"").trim()||"1.2.16";

  try{
    if("caches" in window){
      const keys=await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
  }catch(_){}

  try{
    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
  }catch(_){}

  localStorage.setItem("tubalhub_version_real",targetVersion);
  localStorage.removeItem("tubalhub_pending_update_real");
  localStorage.setItem("tubalhub_notified_ver_real",targetVersion);

  location.href=location.pathname+"?v="+encodeURIComponent(targetVersion)+"&t="+Date.now();
}
function initSystemUpdateReal(){
  const cont=document.getElementById('systemUpdateContainer');
  if(!cont)return;

  cont.setAttribute('aria-hidden','true');

  document.getElementById('updateNowRealBtn')?.addEventListener('click',loadLatestVersionReal);
  document.getElementById('updateLaterRealBtn')?.addEventListener('click',hideSystemUpdateContainerReal);

  window.addEventListener('load',()=>{
    const pending=localStorage.getItem('tubalhub_pending_update_real');
    if(pending){
      try{
        const p=JSON.parse(pending);
        if(p?.data?.version && Date.now()-Number(p.time||0)<3600000){
          systemUpdatePendingReal=p.data;
          renderSystemUpdateListReal(p.data);
          setTimeout(updateContainerShowReal,800);
        }
      }catch(_){}
    }
    detectSystemUpdateReal(false);
  },{once:true});

  setInterval(()=>detectSystemUpdateReal(false),15000);
  window.addEventListener('focus',()=>detectSystemUpdateReal(false),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)detectSystemUpdateReal(false)});
  window.addEventListener('online',()=>detectSystemUpdateReal(false));

  // Initial check: detects the deployed version, but does not force-repeat
  // the same version on every reload.
  detectSystemUpdateReal(false);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initSystemUpdateReal,{once:true});
}else{
  initSystemUpdateReal();
}


if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',renderAllReal,{once:true});}else{renderAllReal();}
