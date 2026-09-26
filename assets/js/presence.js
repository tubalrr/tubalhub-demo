import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const db = getFirestore();
const PRESENCE_WINDOW_MS = 45000;

/* TUBAL HUB — load private calling wherever presence is active */
(function(){
  const load=()=>{
    if(!document.querySelector('link[data-tubal-video-call-css]')){
      const css=document.createElement('link');
      css.rel='stylesheet';
      css.href='/tubalhub/assets/css/video-call.css?v=20260923-callfix';
      css.dataset.tubalVideoCallCss='1';
      document.head.appendChild(css);
    }
    if(document.querySelector('script[data-tubal-video-call]')) return;
    const s=document.createElement('script');
    s.type='module';
    s.src='/tubalhub/assets/js/video-call.js?v=20260923-callfix';
    s.dataset.tubalVideoCall='1';
    document.head.appendChild(s);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load,{once:true});
  else load();
})();

let currentUser = null;
let heartbeat = null;

function onlinePreference() {
  try { return localStorage.getItem('tubalhub_privacy_online') !== '0'; } catch (_) { return true; }
}

async function setPresence(user) {
  if (!user || user.isAnonymous) return;
  const ref = doc(db, 'presence', user.uid);
  const online = onlinePreference();
  await setDoc(ref, {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'Member',
    photoURL: user.photoURL || '',
    online,
    lastSeen: serverTimestamp(),
    presenceWindowMs: PRESENCE_WINDOW_MS
  }, { merge: true });
}

async function syncPrivacyPresence() {
  if (!currentUser || currentUser.isAnonymous) return;
  try { await setPresence(currentUser); } catch (_) {}
}

window.addEventListener('tubalhubprivacychange', () => {
  syncPrivacyPresence();
});

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }

  if (!user || user.isAnonymous) return;

  try {
    await setPresence(user);
  } catch (e) {
    console.warn('[TUBAL HUB presence] initial update failed:', e);
  }

  heartbeat = setInterval(() => {
    if (currentUser) {
      setPresence(currentUser).catch(e =>
        console.warn('[TUBAL HUB presence] heartbeat failed:', e)
      );
    }
  }, 20000);
});

document.addEventListener('visibilitychange', () => {
  if (!currentUser || currentUser.isAnonymous) return;

  if (!document.hidden) {
    setPresence(currentUser).catch(() => {});
  }
});

window.addEventListener('focus', () => {
  if (currentUser && !currentUser.isAnonymous) {
    setPresence(currentUser).catch(() => {});
  }
});
