import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const KEYS = {
  theme:"tubalhub_theme",
  themeLegacy:"tubalhub-theme",
  avatar:"tubalhub_avatar",
  name:"tubalhub_profile_name",
  username:"tubalhub_profile_username",
  bio:"tubalhub_profile_bio",
  language:"tubalhub_lang",
  volume:"tubalhub_sound_volume",
  messageSound:"tubalhub_message_sound",
  deleteMarker:"tubalhub_account_deleted"
};

const state = { user:null, avatarData:"", currentTheme:"midnight" };

const el = {
  tabs:Array.from(document.querySelectorAll(".settings-tabs [data-tab]")),
  panels:Array.from(document.querySelectorAll(".settings-panel[data-panel]")),
  toast:$("#settingsToast"),
  avatar:$("#avatarPreview"),
  avatarInput:$("#avatarInput"),
  removeAvatar:$("#removeAvatar"),
  name:$("#profileName"),username:$("#profileUsername"),bio:$("#profileBio"),
  saveProfile:$("#saveProfile"),
  email:$("#accountEmail"),provider:$("#accountProvider"),
  themeCards:Array.from(document.querySelectorAll("[data-theme-choice]")),
  themeTitle:$("#themePreviewTitle"),themeText:$("#themePreviewText"),
  websiteUpdates:$("#websiteUpdatesToggle"),pushNotifications:$("#pushNotificationsToggle"),
  onlineStatus:$("#onlineStatusToggle"),privacyDot:$("#privacyLiveDot"),privacyTitle:$("#privacyStatusTitle"),privacyText:$("#privacyStatusText"),
  volume:$("#masterVolume"),volumeValue:$("#volumeValue"),messageSound:$("#messageSound"),previewSound:$("#previewSound"),
  language:$("#languageSelect"),saveLanguage:$("#saveLanguage"),
  accountState:$("#accountState"),accountDetails:$("#accountDetails"),
  passwordForm:$("#passwordForm"),currentPassword:$("#currentPassword"),newPassword:$("#newPassword"),confirmPassword:$("#confirmPassword"),
  logout:$("#logoutBtn"),deleteOpen:$("#deleteAccountBtn"),deleteModal:$("#deleteModal"),deleteInput:$("#deleteConfirmInput"),deleteConfirm:$("#confirmDelete"),deleteCancel:$("#cancelDelete"),deleteClose:$("#closeDeleteModal"),
  sidebarStatusDot:$("#sidebarStatusDot"),sidebarStatusText:$("#sidebarStatusText")
};

function storageGet(key, fallback="") {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}
function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("show"), 2300);
}
function burst(button) {
  if (!button) return;
  const old = button.querySelector(".burst-layer");
  old?.remove();
  const layer = document.createElement("span");
  layer.className = "burst-layer";
  layer.style.position = "absolute";
  layer.style.inset = "50% auto auto 50%";
  layer.style.width = "1px";
  layer.style.height = "1px";
  layer.style.pointerEvents = "none";
  for (let i=0;i<6;i++) {
    const dot=document.createElement("i");
    dot.className="burst";
    layer.appendChild(dot);
  }
  button.style.position="relative";
  button.appendChild(layer);
  setTimeout(() => layer.remove(), 520);
}

function applyLocalTheme(theme, persist=true) {
  const value = ["midnight","forest","light"].includes(theme) ? theme : "midnight";
  state.currentTheme = value;
  document.documentElement.setAttribute("data-theme", value);
  document.body.classList.remove("theme-midnight","theme-forest","theme-light");
  document.body.classList.add("theme-" + value);
  $$(".theme-card").forEach(card => {
    const active=card.dataset.themeChoice===value;
    card.classList.toggle("active",active);
    card.setAttribute("aria-pressed",String(active));
  });
  const copy = {
    midnight:["Midnight","Circuit neon and sharp glass."],
    forest:["Forest","Organic glass with sage leaf glow."],
    light:["Light","Minimal white glass with pastel softness."]
  }[value];
  el.themeTitle.textContent=copy[0];
  el.themeText.textContent=copy[1];
  if (persist) {
    storageSet(KEYS.theme,value);
    storageSet(KEYS.themeLegacy,value);
  }
  window.dispatchEvent(new CustomEvent("tubalhubthemechange",{detail:{theme:value}}));
}

function initTabs() {
  el.tabs.forEach(tab => tab.addEventListener("click", () => {
    const name=tab.dataset.tab;
    el.tabs.forEach(x=>x.classList.toggle("active",x===tab));
    el.panels.forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===name));
    const target=el.panels.find(panel=>panel.dataset.panel===name);
    target?.scrollIntoView({block:"start"});
  }));
}

function initSpotlight() {
  let frame=0,lastX=0,lastY=0;
  const move=(event)=>{
    lastX=event.clientX;lastY=event.clientY;
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      document.documentElement.style.setProperty("--mx",lastX+"px");
      document.documentElement.style.setProperty("--my",lastY+"px");
      frame=0;
    });
  };
  window.addEventListener("pointermove",move,{passive:true});
}

function loadProfile() {
  state.avatarData=storageGet(KEYS.avatar,"");
  if(state.avatarData) {
    el.avatar.innerHTML='<img src="'+CSS.escape(state.avatarData).replace(/\\\\/g,'\\\\')+'" alt="Your avatar">';
  } else {
    el.avatar.innerHTML='<span class="emoji" aria-hidden="true">👤</span>';
  }
  el.name.value=storageGet(KEYS.name,"");
  el.username.value=storageGet(KEYS.username,"");
  el.bio.value=storageGet(KEYS.bio,"");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Could not read that image."));
    reader.onload=()=>resolve(String(reader.result||""));
    reader.readAsDataURL(file);
  });
}

async function handleAvatar(file) {
  if(!file)return;
  if(!file.type.startsWith("image/")) { showToast("Please choose an image file."); return; }
  if(file.size>3*1024*1024) { showToast("Avatar image must be 3 MB or smaller."); return; }
  try {
    const data=await readFileAsDataUrl(file);
    state.avatarData=data;
    el.avatar.innerHTML='<img src="'+data.replace(/"/g,"&quot;")+'" alt="Your avatar">';
    showToast("Avatar preview ready. Save Profile to keep it.");
  } catch(error) { showToast(error.message||"Could not read avatar."); }
}

function saveProfile() {
  const ok1=storageSet(KEYS.avatar,state.avatarData);
  const ok2=storageSet(KEYS.name,el.name.value.trim());
  const ok3=storageSet(KEYS.username,el.username.value.trim());
  const ok4=storageSet(KEYS.bio,el.bio.value.trim());
  if(!(ok1&&ok2&&ok3&&ok4)) { showToast("Browser storage could not save the profile."); return; }
  burst(el.saveProfile);
  showToast("Profile saved on this device.");
}

function loadToggle(key, fallback=false) {
  const raw=storageGet(key,"");
  if(raw==="") return fallback;
  return raw==="1" || raw==="true";
}
function saveToggle(input) {
  storageSet(input.dataset.settingToggle,input.checked?"1":"0");
  input.dispatchEvent(new CustomEvent("tubalhubsettingschange",{bubbles:false,detail:{key:input.dataset.settingToggle,value:input.checked}}));
}
function loadToggles() {
  $$(".switch input[data-setting-toggle]").forEach(input=>{
    const fallback=input.checked;
    input.checked=loadToggle(input.dataset.settingToggle,fallback);
  });
  if(typeof Notification!=="undefined" && Notification.permission==="granted") {
    el.pushNotifications.checked=true;
  }
  updatePrivacyUi();
}

function applyWebsiteUpdateSetting(enabled) {
  storageSet("tubalhub_notif_website_updates",enabled?"1":"0");
  window.tubalHubUpdateNotifier?.setEnabled?.(enabled);
  window.dispatchEvent(new CustomEvent("tubalhub:update-setting",{detail:{enabled}}));
}

async function requestPush(enabled) {
  if (!enabled) {
    storageSet("tubalhub_notif_push","0");
    return;
  }
  if (!("Notification" in window)) {
    el.pushNotifications.checked=false;
    storageSet("tubalhub_notif_push","0");
    showToast("Push notifications are not supported in this browser.");
    return;
  }
  try {
    const permission=await Notification.requestPermission();
    const granted=permission==="granted";
    el.pushNotifications.checked=granted;
    storageSet("tubalhub_notif_push",granted?"1":"0");
    showToast(granted?"Push notification permission granted.":"Push notification permission was not granted.");
  } catch(error) {
    el.pushNotifications.checked=false;
    storageSet("tubalhub_notif_push","0");
    showToast(error.message||"Notification permission failed.");
  }
}

function updatePrivacyUi() {
  const online=el.onlineStatus.checked;
  el.privacyDot.classList.toggle("offline",!online);
  el.privacyTitle.textContent=online?"Online status enabled":"Online status hidden";
  el.privacyText.textContent=online?"Your presence can be published while signed in.":"Your presence preference is off.";
  window.dispatchEvent(new CustomEvent("tubalhubprivacychange",{detail:{
    onlineStatus:online,
    showEmail:loadToggle("tubalhub_privacy_email",false),
    allowTagging:loadToggle("tubalhub_privacy_tagging",true),
    dataSaver:loadToggle("tubalhub_privacy_data_saver",false)
  }}));
}

function bindToggles() {
  $$(".switch input[data-setting-toggle]").forEach(input=>{
    input.addEventListener("change",async()=>{
      saveToggle(input);
      if(input===el.websiteUpdates) {
        applyWebsiteUpdateSetting(input.checked);
        showToast(input.checked?"Website update checks enabled.":"Website update checks disabled.");
      } else if(input===el.pushNotifications) {
        await requestPush(input.checked);
      } else if(input.dataset.settingToggle.startsWith("tubalhub_privacy_")) {
        if(input===el.onlineStatus) storageSet("tubalhub_privacy_online",input.checked?"1":"0");
        updatePrivacyUi();
        showToast("Privacy setting saved.");
      } else if(input.dataset.settingToggle.startsWith("tubalhub_sound_")) {
        showToast("Sound preference saved.");
      } else {
        showToast("Notification preference saved.");
      }
    });
  });
}

function loadAppearance() {
  const saved=storageGet(KEYS.theme,storageGet(KEYS.themeLegacy,"midnight"));
  applyLocalTheme(saved,false);
  el.themeCards.forEach(card=>card.addEventListener("click",()=>{
    applyLocalTheme(card.dataset.themeChoice,true);
    showToast(card.dataset.themeChoice.charAt(0).toUpperCase()+card.dataset.themeChoice.slice(1)+" theme applied.");
  }));
}

function setAuthUi(user) {
  state.user=user;
  if(!user) {
    el.email.textContent="Not signed in";
    el.provider.textContent="Login is required for Firebase account actions.";
    el.accountState.textContent="Not signed in";
    el.accountDetails.textContent="Profile fields can still be stored locally.";
    return;
  }
  const email=user.email||"Email not provided by the authentication provider";
  el.email.textContent=email;
  const providerIds=(user.providerData||[]).map(p=>p.providerId).filter(Boolean);
  el.provider.textContent=providerIds.length?"Provider: "+providerIds.join(", "):"Firebase Authentication";
  el.accountState.textContent=user.isAnonymous?"Guest session":"Signed in";
  el.accountDetails.textContent=user.uid ? "UID available to Firebase Authentication" : "Firebase Authentication";
}

async function changePassword(event) {
  event.preventDefault();
  const user=auth.currentUser;
  const current=el.currentPassword.value;
  const next=el.newPassword.value;
  const confirm=el.confirmPassword.value;
  if(!user || user.isAnonymous) { showToast("Sign in with a real account before changing the password."); return; }
  if(!current || !next || !confirm) { showToast("Complete all password fields."); return; }
  if(next.length<8) { showToast("New password must be at least 8 characters."); return; }
  if(next!==confirm) { showToast("New password and confirmation do not match."); return; }
  const hasPasswordProvider=(user.providerData||[]).some(p=>p.providerId==="password");
  if(!hasPasswordProvider) { showToast("This account does not use an email/password sign-in method."); return; }

  try {
    const credential=EmailAuthProvider.credential(user.email,current);
    await reauthenticateWithCredential(user,credential);
    await updatePassword(user,next);
    el.passwordForm.reset();
    showToast("Password changed successfully.");
  } catch(error) {
    console.error("[Settings] password update",error);
    const msg=error?.code==="auth/wrong-password"||error?.code==="auth/invalid-credential"?"Current password is incorrect.":error?.message||"Password change failed.";
    showToast(msg);
  }
}

async function logout() {
  try { await signOut(auth); } catch(error) { console.warn("[Settings] sign out",error); }
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  window.location.href="login.html";
}

function openDeleteModal() {
  el.deleteInput.value="";
  el.deleteConfirm.disabled=true;
  el.deleteModal.hidden=false;
  requestAnimationFrame(()=>el.deleteInput.focus());
}
function closeDeleteModal() { el.deleteModal.hidden=true; }
async function confirmDelete() {
  const user=auth.currentUser;
  if(el.deleteInput.value!=="DELETE") return;
  if(!user || user.isAnonymous) { showToast("Sign in with a real account before deleting it."); closeDeleteModal(); return; }
  el.deleteConfirm.disabled=true;
  el.deleteConfirm.textContent="Deleting…";
  try {
    await deleteUser(user);
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.location.href="login.html";
  } catch(error) {
    console.error("[Settings] account deletion",error);
    el.deleteConfirm.disabled=false;
    el.deleteConfirm.textContent="Delete Account";
    showToast(error?.code==="auth/requires-recent-login"?"For security, sign in again and retry account deletion.":error?.message||"Account deletion failed.");
  }
}

function storageSizeKb() {
  let bytes=0;
  try {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||"";
      const value=localStorage.getItem(key)||"";
      bytes += (key.length + value.length) * 2;
    }
  } catch {}
  return bytes/1024;
}

async function loadVersion() {
  const label = $("#settingsVersion");
  if(!label) return;
  try {
    const response=await fetch("../version.json?t="+Date.now(),{cache:"no-store"});
    if(!response.ok) throw new Error("version.json "+response.status);
    const data=await response.json();
    label.textContent="v"+(data.version||"—");
  } catch {
    label.textContent="Version unavailable";
  }
}

function updateConnectionStatus() {
  const online=navigator.onLine;
  el.sidebarStatusDot.classList.toggle("offline",!online);
  el.sidebarStatusText.textContent=online?"Online connection":"Offline connection";
  const footerDot=$("#footerStatusDot"),footerText=$("#footerStatusText");
  footerDot?.classList.toggle("offline",!online);
  if(footerText) footerText.textContent=online?"Online":"Offline";
}

function globalAudioVolume(value) {
  const volume=Math.max(0,Math.min(1,Number(value)));
  $$("audio,video").forEach(media=>{media.volume=volume});
  try { localStorage.setItem(KEYS.volume,String(volume)); } catch {}
  window.dispatchEvent(new CustomEvent("tubalhubvolumechange",{detail:{volume}}));
}

function createSoundContext() {
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass) throw new Error("Web Audio is not supported.");
  return new AudioContextClass();
}
async function previewMessageSound() {
  try {
    const ctx=createSoundContext();
    if(ctx.state==="suspended") await ctx.resume();
    const gain=ctx.createGain();
    const osc=ctx.createOscillator();
    const type=el.messageSound.value;
    const now=ctx.currentTime;
    const master=Number(el.volume.value);
    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.02,master*.12),now+.012);
    const finish=(end)=>{gain.gain.exponentialRampToValueAtTime(.0001,now+end);osc.stop(now+end+.03);};
    if(type==="pop") {osc.type="sine";osc.frequency.setValueAtTime(680,now);osc.frequency.exponentialRampToValueAtTime(980,now+.07);finish(.13);}
    else if(type==="soft") {osc.type="sine";osc.frequency.setValueAtTime(440,now);osc.frequency.exponentialRampToValueAtTime(330,now+.22);finish(.32);}
    else {osc.type="triangle";osc.frequency.setValueAtTime(523.25,now);osc.frequency.exponentialRampToValueAtTime(783.99,now+.18);finish(.3);}
    osc.connect(gain);gain.connect(ctx.destination);osc.start();
    osc.addEventListener("ended",()=>ctx.close(),{once:true});
  } catch(error) { showToast(error.message||"Sound preview failed."); }
}

function loadSound() {
  const volume=Number(storageGet(KEYS.volume,"1"));
  el.volume.value=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):1;
  el.volumeValue.textContent=Math.round(Number(el.volume.value)*100)+"%";
  const sound=storageGet(KEYS.messageSound,"pop");
  el.messageSound.value=["pop","soft","chime"].includes(sound)?sound:"pop";
  globalAudioVolume(el.volume.value);
  el.volume.addEventListener("input",()=>{
    el.volumeValue.textContent=Math.round(Number(el.volume.value)*100)+"%";
    globalAudioVolume(el.volume.value);
  });
  el.messageSound.addEventListener("change",()=>{
    storageSet(KEYS.messageSound,el.messageSound.value);
    showToast("Message sound saved.");
  });
  el.previewSound.addEventListener("click",previewMessageSound);
}

function loadLanguage() {
  const lang=storageGet(KEYS.language,"English");
  el.language.value=["English","Tagalog","Bisaya"].includes(lang)?lang:"English";
  el.saveLanguage.addEventListener("click",()=>{
    storageSet(KEYS.language,el.language.value);
    window.dispatchEvent(new CustomEvent("tubalhublanguagechange",{detail:{language:el.language.value}}));
    showToast("Language preference saved.");
  });
}

function loadSettingsFooter() {
  const footer=document.createElement("footer");
  footer.className="settings-footer";
  footer.innerHTML='<div><strong>TUBAL HUB SETTINGS</strong><span>Storage used: <b id="settingsStorageSize">'+storageSizeKb().toFixed(1)+' KB</b></span></div><div class="footer-version"><span id="footerStatusDot" class="status-dot" aria-hidden="true"></span><span id="footerStatusText">Checking</span><strong id="settingsVersion">Loading version…</strong></div>';
  $(".settings-scroll").appendChild(footer);
  loadVersion();
  updateConnectionStatus();
  window.addEventListener("online",updateConnectionStatus);
  window.addEventListener("offline",updateConnectionStatus);
}

function bindAvatar() {
  el.avatarInput.addEventListener("change",()=>handleAvatar(el.avatarInput.files?.[0]));
  el.removeAvatar.addEventListener("click",()=>{
    state.avatarData="";
    storageRemove(KEYS.avatar);
    el.avatar.innerHTML='<span class="emoji" aria-hidden="true">👤</span>';
    showToast("Avatar removed from this device.");
  });
}

function init() {
  initSpotlight();
  initTabs();
  loadAppearance();
  loadProfile();
  loadToggles();
  bindToggles();
  bindAvatar();
  el.saveProfile.addEventListener("click",saveProfile);
  el.passwordForm.addEventListener("submit",changePassword);
  el.logout.addEventListener("click",logout);
  el.deleteOpen.addEventListener("click",openDeleteModal);
  el.deleteCancel.addEventListener("click",closeDeleteModal);
  el.deleteClose.addEventListener("click",closeDeleteModal);
  el.deleteInput.addEventListener("input",()=>{el.deleteConfirm.disabled=el.deleteInput.value!=="DELETE"});
  el.deleteConfirm.addEventListener("click",confirmDelete);
  el.onlineStatus.addEventListener("change",updatePrivacyUi);
  loadSound();
  loadLanguage();
  loadSettingsFooter();
  onAuthStateChanged(auth,setAuthUi);
  window.addEventListener("storage",event=>{
    if(event.key===KEYS.theme||event.key===KEYS.themeLegacy) applyLocalTheme(event.newValue||"midnight",false);
    if(event.key==="tubalhub_privacy_online") { el.onlineStatus.checked=event.newValue!=="0"; updatePrivacyUi(); }
  });
}

init();
