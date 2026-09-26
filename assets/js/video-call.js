/* TUBAL HUB — Messenger-style 1-to-1 WebRTC video calls
   Firebase Firestore = signaling only.
   Media stays peer-to-peer through WebRTC; no Jitsi and no video storage.
*/
import { app, auth } from "./firebase-config.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js";

const db = getFirestore(app);

// FCM Web Push setup. The VAPID key is public and safe to ship in the client.
const FCM_VAPID_KEY = "BPLp0H7B7rJAM4X9y3tUI6mK25nDfSX4sQNjqGk1P1_6sDiCRG06NZBt8GR_vX3ZraMdCcPBlnpe7xnAaqWslUI";
let pushReady = false;

async function setupCallPush(){
  if(!isReal() || pushReady || !("Notification" in window) || !("serviceWorker" in navigator)) return;
  try{
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if(permission !== "granted") return;

    const registration = await navigator.serviceWorker.register("/tubalhub/firebase-messaging-sw.js", {scope:"/tubalhub/"});
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if(!token || !user) return;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      displayName: displayName(user),
      email: user.email || "",
      photoURL: user.photoURL || "",
      fcmToken: token,
      fcmUpdatedAt: serverTimestamp()
    }, {merge:true});
    pushReady = true;
    console.log("[TUBAL HUB] FCM call notifications ready");
  }catch(e){
    console.warn("[TUBAL HUB] FCM setup unavailable", e);
  }
}


/* WebRTC ICE configuration.
   STUN handles direct connections; Open Relay TURN is the fallback when
   phone/PC networks cannot establish a direct media path. */
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:openrelay.metered.ca:80" },

    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 10,
  rtcpMuxPolicy: "require"
};

let user = null;
let callRef = null;
let callId = null;
let peer = null;
let localStream = null;
let remoteStream = null;
let stopIncoming = null;
let stopCallDoc = null;
let incomingId = null;
let incomingData = null;
let callRole = null;
let ending = false;
let remoteCandidateKeys = new Set();
let remoteDescriptionReady = false;

const $ = id => document.getElementById(id);
const isReal = () => !!user && !user.isAnonymous;

// Lightweight Messenger-style call sounds generated locally with Web Audio.
// No audio file, Firebase Storage, or external asset is required.
let ringtoneCtx = null;
let ringtoneTimer = null;
let ringtoneActive = false;

function ensureRingtoneAudio(){
  try{
    if(!ringtoneCtx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ringtoneCtx = new AC();
    }
    if(ringtoneCtx.state === "suspended") ringtoneCtx.resume().catch(()=>{});
    return ringtoneCtx;
  }catch(e){ return null; }
}

function playCallTone(){
  const ctx = ensureRingtoneAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  [0, 0.22].forEach(offset=>{
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.17);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.19);
  });
}

function startCallSound(){
  stopCallSound();
  if(!ensureRingtoneAudio()) return;
  ringtoneActive = true;
  playCallTone();
  ringtoneTimer = setInterval(()=>{
    if(ringtoneActive) playCallTone();
  }, 1600);
}

function stopCallSound(){
  ringtoneActive = false;
  if(ringtoneTimer){
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
}

document.addEventListener("pointerdown", ()=>ensureRingtoneAudio(), {once:false, passive:true});
document.addEventListener("pointerdown", ()=>setupCallPush(), {once:false, passive:true});
const displayName = u => u?.displayName || u?.email?.split("@")[0] || "Member";
const initials = n => (n || "Member").trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase() || "M";

function injectUI(){
  if ($("videoCallUI")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div id="videoCallUI" class="vc-overlay" hidden>
      <div class="vc-call-window">
        <div class="vc-call-top">
          <div class="vc-call-person">
            <div class="vc-status-dot"></div>
            <div>
              <strong id="vcTitle">Video Call</strong>
              <span id="vcStatus">Connecting…</span>
            </div>
          </div>
          <button id="vcCloseTop" class="vc-icon-btn" type="button" aria-label="End call">×</button>
        </div>

        <div class="vc-stage" id="vcStage">
          <video id="vcRemoteVideo" class="vc-remote-video" autoplay playsinline></video>
          <div id="vcRemoteFallback" class="vc-remote-fallback">
            <div class="vc-big-avatar" id="vcRemoteAvatar">M</div>
            <strong id="vcRemoteFallbackName">Member</strong>
            <span id="vcRemoteFallbackStatus">Connecting…</span>
          </div>
          <video id="vcLocalVideo" class="vc-local-video" autoplay muted playsinline></video>
          <div class="vc-call-badge" id="vcCallBadge">Connecting…</div>
        </div>

        <div class="vc-controls">
          <button id="vcMute" class="vc-control" type="button" title="Mute microphone">🎤<span>Mute</span></button>
          <button id="vcCamera" class="vc-control" type="button" title="Turn camera off">📷<span>Camera</span></button>
          <button id="vcSwitch" class="vc-control" type="button" title="Switch camera">🔄<span>Switch</span></button>
          <button id="vcEnd" class="vc-control vc-end" type="button" title="End call">☎<span>End</span></button>
        </div>
      </div>
    </div>

    <div id="vcIncoming" class="vc-incoming" hidden>
      <div class="vc-incoming-card">
        <div class="vc-incoming-avatar" id="vcIncomingAvatar">M</div>
        <div class="vc-incoming-copy">
          <strong id="vcIncomingName">Incoming call</strong>
          <span id="vcIncomingText">Incoming video call</span>
        </div>
        <button id="vcDecline" class="vc-incoming-btn decline" type="button" aria-label="Decline">☎</button>
        <button id="vcAccept" class="vc-incoming-btn accept" type="button" aria-label="Accept">📹</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  $("vcEnd").onclick = () => endCall(true);
  $("vcCloseTop").onclick = () => endCall(true);
  $("vcDecline").onclick = declineIncoming;
  $("vcAccept").onclick = acceptIncoming;
  $("vcMute").onclick = toggleMute;
  $("vcCamera").onclick = toggleCamera;
  $("vcSwitch").onclick = switchCamera;
}

function showActive(title, status, otherName){
  injectUI();
  $("vcTitle").textContent = title || "Video Call";
  $("vcStatus").textContent = status || "Connecting…";
  $("vcCallBadge").textContent = status || "Connecting…";
  $("vcRemoteFallbackName").textContent = otherName || "Member";
  $("vcRemoteAvatar").textContent = initials(otherName);
  $("videoCallUI").hidden = false;
}

function hideActive(){
  if ($("videoCallUI")) $("videoCallUI").hidden = true;
}

function showIncoming(d){
  injectUI();
  incomingData = d;
  const n = d.callerName || "Member";
  $("vcIncomingName").textContent = n;
  $("vcIncomingText").textContent = "Incoming video call";
  $("vcIncomingAvatar").textContent = initials(n);
  $("vcIncoming").hidden = false;
  startCallSound();
  showBackgroundCallNotification(n, d);
}

let callNotification = null;
function showBackgroundCallNotification(name, data){
  try{
    if(!("Notification" in window) || Notification.permission !== "granted") return;
    if(!document.hidden) return;
    if(callNotification) callNotification.close();
    callNotification = new Notification("TUBAL HUB — Incoming Call", {
      body: name + " is calling you on TUBAL HUB.",
      tag: "tubalhub-incoming-call-" + (data?.callerId || "call"),
      requireInteraction: true,
      vibrate: [300, 120, 300, 120, 600],
      icon: "/tubalhub/tubal-hub-logo.png",
      badge: "/tubalhub/tubal-hub-logo.png"
    });
    callNotification.onclick = () => {
      try { window.focus(); } catch {}
      callNotification?.close();
      callNotification = null;
      showIncoming(data);
    };
  }catch(e){
    console.warn("[TUBAL HUB] background call notification unavailable", e);
  }
}

function hideIncoming(){
  stopCallSound();
  if(callNotification){ try{ callNotification.close(); }catch{} callNotification=null; }
  if ($("vcIncoming")) $("vcIncoming").hidden = true;
}

function setCallStatus(text){
  if ($("vcStatus")) $("vcStatus").textContent = text;
  if ($("vcCallBadge")) $("vcCallBadge").textContent = text;
  if ($("vcRemoteFallbackStatus")) $("vcRemoteFallbackStatus").textContent = text;
}

function candidateKey(c){
  return JSON.stringify([
    c?.candidate || "",
    c?.sdpMid ?? null,
    c?.sdpMLineIndex ?? null,
    c?.usernameFragment ?? null
  ]);
}

async function getMedia(){
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("MEDIA_UNAVAILABLE");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
    });
  } catch (e) {
    if (e?.name === "NotFoundError") {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
        setCallStatus("Camera unavailable — voice only");
        return audioOnly;
      } catch {}
    }
    throw e;
  }
}

function attachLocal(stream){
  localStream = stream;
  const v = $("vcLocalVideo");
  if (!v) return;
  v.srcObject = stream;
  v.style.display = stream.getVideoTracks().length ? "block" : "none";
  v.play?.().catch(()=>{});
}

function enableLocalVideoDrag(){
  const v = $("vcLocalVideo");
  const stage = $("vcStage");
  if (!v || !stage || v.dataset.dragReady === "1") return;
  v.dataset.dragReady = "1";
  let dragging = false, moved = false, offsetX = 0, offsetY = 0;

  const clamp = (n,min,max) => Math.max(min, Math.min(max,n));

  v.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const vr = v.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    offsetX = e.clientX - vr.left;
    offsetY = e.clientY - vr.top;
    v.style.left = (vr.left - sr.left) + "px";
    v.style.top = (vr.top - sr.top) + "px";
    v.style.right = "auto";
    v.style.bottom = "auto";
    dragging = true;
    moved = false;
    v.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  v.addEventListener("pointermove", e => {
    if (!dragging) return;
    const sr = stage.getBoundingClientRect();
    const maxX = Math.max(0, sr.width - v.offsetWidth);
    const maxY = Math.max(0, sr.height - v.offsetHeight);
    const x = clamp(e.clientX - sr.left - offsetX, 0, maxX);
    const y = clamp(e.clientY - sr.top - offsetY, 0, maxY);
    if (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 1) moved = true;
    v.style.left = x + "px";
    v.style.top = y + "px";
  });

  const release = e => {
    if (!dragging) return;
    dragging = false;
    try { v.releasePointerCapture?.(e.pointerId); } catch {}
  };
  v.addEventListener("pointerup", release);
  v.addEventListener("pointercancel", release);
}

function attachRemote(stream){
  remoteStream = stream;
  const v = $("vcRemoteVideo");
  if (!v) return;
  v.srcObject = stream;
  v.play?.().catch(()=>{});
  const hasVideo = stream.getVideoTracks().length > 0;
  $("vcRemoteFallback").style.display = hasVideo ? "none" : "grid";
}

function cleanupPeer(){
  if (stopCallDoc) {
    stopCallDoc();
    stopCallDoc = null;
  }
  if (peer) {
    try { peer.ontrack = null; peer.onicecandidate = null; peer.close(); } catch {}
    peer = null;
  }
  localStream?.getTracks?.().forEach(t => t.stop());
  remoteStream?.getTracks?.().forEach(t => t.stop());
  localStream = null;
  remoteStream = null;
  remoteDescriptionReady = false;
  remoteCandidateKeys.clear();

  if ($("vcLocalVideo")) $("vcLocalVideo").srcObject = null;
  if ($("vcRemoteVideo")) $("vcRemoteVideo").srcObject = null;
}

function createPeer(){
  peer = new RTCPeerConnection(RTC_CONFIG);
  peer.ontrack = event => {
    const stream = event.streams?.[0] || remoteStream || new MediaStream();
    if (!event.streams?.[0]) stream.addTrack(event.track);
    attachRemote(stream);
    setCallStatus("Connected");
  };

  peer.onicecandidate = async event => {
    if (!event.candidate || !callRef || ending) return;
    const field = callRole === "caller" ? "callerCandidates" : "calleeCandidates";
    try {
      await updateDoc(callRef, {
        [field]: arrayUnion(event.candidate.toJSON()),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("[TUBAL HUB] ICE signal failed", e);
    }
  };

  peer.onicecandidateerror = event => {
    console.warn("[TUBAL HUB] ICE candidate error", {
      url: event?.url,
      code: event?.errorCode,
      text: event?.errorText
    });
  };

  peer.onicegatheringstatechange = () => {
    console.log("[TUBAL HUB] ICE gathering:", peer?.iceGatheringState);
  };

  peer.oniceconnectionstatechange = () => {
    const state = peer?.iceConnectionState;
    if (state === "connected" || state === "completed") {
      setCallStatus("Connected");
    } else if (state === "checking") {
      setCallStatus("Connecting…");
    } else if (state === "disconnected") {
      setCallStatus("Connection interrupted…");
    } else if (state === "failed") {
      setCallStatus("Connection failed — retrying ICE…");
      try {
        if (peer && peer.signalingState !== "closed") peer.restartIce();
      } catch {}
    }
  };

  peer.onconnectionstatechange = async () => {
    const state = peer?.connectionState;
    if (state === "connected") {
      setCallStatus("Connected");
      await reportIcePath();
    }
    if (state === "failed") {
      setCallStatus("Connection failed — network/relay unavailable");
      await reportIcePath();
    }
    if (state === "disconnected") setCallStatus("Connection interrupted…");
  };

  return peer;
}

async function reportIcePath(){
  if (!peer) return;
  try {
    const stats = await peer.getStats();
    let selected = null;
    stats.forEach(s => {
      if (s.type === "candidate-pair" && (s.selected || s.nominated) && s.state === "succeeded") selected = s;
    });
    if (!selected) return;
    const local = stats.get(selected.localCandidateId);
    const remote = stats.get(selected.remoteCandidateId);
    const path = local?.candidateType || "unknown";
    console.log("[TUBAL HUB] Selected ICE path:", {
      localType: local?.candidateType,
      localProtocol: local?.protocol,
      remoteType: remote?.candidateType,
      remoteProtocol: remote?.protocol,
      relayProtocol: local?.relayProtocol || null
    });
    if (path === "relay") setCallStatus("Connected • Relay");
  } catch (e) {
    console.warn("[TUBAL HUB] ICE stats unavailable", e);
  }
}

function startConnectionWatchdog(){
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    if (!peer || ending) { clearInterval(timer); return; }
    if (peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
      clearInterval(timer);
      await reportIcePath();
      return;
    }
    if (Date.now() - startedAt >= 20000) {
      clearInterval(timer);
      await reportIcePath();
      setCallStatus("Unable to connect — TURN/network blocked");
    }
  }, 1000);
}

function addLocalTracks(){
  if (!peer || !localStream) return;
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
}

async function addRemoteCandidates(list){
  if (!peer || !remoteDescriptionReady || !Array.isArray(list)) return;
  for (const c of list) {
    const key = candidateKey(c);
    if (remoteCandidateKeys.has(key)) continue;
    try {
      await peer.addIceCandidate(new RTCIceCandidate(c));
      remoteCandidateKeys.add(key);
    } catch (e) {
      console.warn("[TUBAL HUB] addIceCandidate", e);
    }
  }
}

function watchCallDocument(ref){
  if (stopCallDoc) stopCallDoc();

  stopCallDoc = onSnapshot(ref, async snap => {
    if (!snap.exists() || ending) return;
    const d = snap.data();

    if (d.status === "declined" || d.status === "ended" || d.status === "missed") {
      if (!ending) {
        setCallStatus(d.status === "declined" ? "Call declined" : "Call ended");
        setTimeout(() => resetCall(), 350);
      }
      return;
    }

    try {
      if (callRole === "caller") {
        if (d.status === "accepted") {
          // Stop ringing immediately when the callee accepts.
          stopCallSound();
        }
        if (d.status === "accepted" && !peer) {
          await startCallerConnection(d);
          return;
        }
        if (d.answer && peer && !peer.currentRemoteDescription) {
          await peer.setRemoteDescription(new RTCSessionDescription(d.answer));
          remoteDescriptionReady = true;
          await addRemoteCandidates(d.calleeCandidates || []);
        } else if (peer && remoteDescriptionReady) {
          await addRemoteCandidates(d.calleeCandidates || []);
        }
      } else if (callRole === "callee") {
        if (d.offer && peer && !peer.currentRemoteDescription) {
          await peer.setRemoteDescription(new RTCSessionDescription(d.offer));
          remoteDescriptionReady = true;
          await addRemoteCandidates(d.callerCandidates || []);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await updateDoc(ref, {
            answer: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
            status: "connecting",
            updatedAt: serverTimestamp()
          });
          setCallStatus("Connecting…");
        } else if (peer && remoteDescriptionReady) {
          await addRemoteCandidates(d.callerCandidates || []);
        }
      }
    } catch (e) {
      console.error("[TUBAL HUB] signaling", e);
      setCallStatus("Call setup error");
    }
  }, e => {
    console.error("[TUBAL HUB] call listener", e);
    setCallStatus("Call signal unavailable");
  });
}

async function startCallerConnection(data){
  if (!callRef || peer || ending) return;

  setCallStatus("Starting camera…");
  try {
    attachLocal(await getMedia());
  } catch (e) {
    console.error(e);
    throwMediaError(e);
    await updateDoc(callRef, { status: "ended", updatedAt: serverTimestamp() }).catch(()=>{});
    return;
  }

  createPeer();
  addLocalTracks();

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  await updateDoc(callRef, {
    offer: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
    status: "connecting",
    updatedAt: serverTimestamp()
  });

  setCallStatus("Connecting…");
  startConnectionWatchdog();
}

async function startCalleeConnection(data){
  if (!callRef || peer || ending) return;

  setCallStatus("Starting camera…");
  try {
    attachLocal(await getMedia());
  } catch (e) {
    console.error(e);
    throwMediaError(e);
    await updateDoc(callRef, { status: "ended", updatedAt: serverTimestamp() }).catch(()=>{});
    return;
  }

  createPeer();
  addLocalTracks();
  setCallStatus("Waiting for caller…");
  startConnectionWatchdog();
}

function throwMediaError(e){
  const map = {
    NotAllowedError: "Camera/microphone permission was denied.",
    NotFoundError: "No camera or microphone was found.",
    NotReadableError: "Camera or microphone is busy or unavailable.",
    OverconstrainedError: "The camera does not support the requested settings.",
    MEDIA_UNAVAILABLE: "This browser does not support camera/microphone access."
  };
  alert(map[e?.name] || map[e?.message] || "Could not access the camera or microphone.");
}

async function startCall(target){
  if (!isReal() || !target?.uid || target.uid === user.uid || callRef) return;

  ending = false;
  callRole = "caller";

  try {
    const ref = doc(collection(db, "videoCalls"));
    callRef = ref;
    callId = ref.id;

    await setDoc(ref, {
      callerId: user.uid,
      calleeId: target.uid,
      callerName: displayName(user),
      callerPhotoURL: user.photoURL || "",
      calleeName: target.displayName || "Member",
      media: "video",
      status: "ringing",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      callerCandidates: [],
      calleeCandidates: []
    });

    hideIncoming();
    showActive("Calling " + (target.displayName || "Member"), "Ringing…", target.displayName || "Member");
    startCallSound();
    watchCallDocument(ref);
  } catch (e) {
    console.error("[TUBAL HUB] startCall", e);
    alert("Hindi ma-start ang video call. Subukan ulit.");
    await safeDelete(callRef);
    resetCall();
  }
}

async function acceptIncoming(){
  if (!incomingId || callRef || !isReal()) return;

  const id = incomingId;
  incomingId = null;
  incomingData = null;
  hideIncoming();

  const ref = doc(db, "videoCalls", id);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const d = snap.data();
    if (d.calleeId !== user.uid || d.status !== "ringing") return;

    ending = false;
    callRole = "callee";
    callRef = ref;
    callId = id;

    await updateDoc(ref, {
      status: "accepted",
      updatedAt: serverTimestamp()
    });

    // The incoming ringtone must stop the instant the call is accepted.
    stopCallSound();
    showActive("Call with " + (d.callerName || "Member"), "Starting…", d.callerName || "Member");
    watchCallDocument(ref);
    await startCalleeConnection(d);
  } catch (e) {
    console.error("[TUBAL HUB] acceptIncoming", e);
    try { await updateDoc(ref, { status: "ended", updatedAt: serverTimestamp() }); } catch {}
    resetCall();
    alert("Hindi ma-open ang video call. Subukan ulit.");
  }
}

async function declineIncoming(){
  const id = incomingId;
  incomingId = null;
  incomingData = null;
  hideIncoming();
  if (!id) return;

  try {
    const ref = doc(db, "videoCalls", id);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().calleeId === user.uid && snap.data().status === "ringing") {
      await updateDoc(ref, { status: "declined", updatedAt: serverTimestamp() });
      setTimeout(() => safeDelete(ref), 3000);
    }
  } catch (e) {
    console.error("[TUBAL HUB] decline", e);
  }
}

async function endCall(notify = true){
  if (ending) return;
  ending = true;

  const ref = callRef;
  try {
    if (notify && ref) {
      await updateDoc(ref, { status: "ended", updatedAt: serverTimestamp() });
    }
  } catch (e) {
    console.warn("[TUBAL HUB] end signal", e);
  }

  cleanupPeer();
  await safeDelete(ref);
  resetCall();
}

function resetCall(){
  if(callNotification){ try{ callNotification.close(); }catch{} callNotification=null; }
  stopCallSound();
  ending = false;
  cleanupPeer();
  callRef = null;
  callId = null;
  callRole = null;
  hideActive();
  hideIncoming();
  incomingId = null;
  incomingData = null;
}

async function safeDelete(ref){
  if (!ref) return;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) await deleteDoc(ref);
  } catch {}
}

function watchIncoming(){
  if (stopIncoming) {
    stopIncoming();
    stopIncoming = null;
  }
  if (!isReal()) return;

  const q = query(
    collection(db, "videoCalls"),
    where("calleeId", "==", user.uid),
    where("status", "==", "ringing")
  );

  stopIncoming = onSnapshot(q, snap => {
    if (!isReal() || callRef) return;

    const calls = [];
    snap.forEach(s => {
      const d = s.data();
      if (d.calleeId === user.uid && d.status === "ringing") {
        calls.push({ id: s.id, data: d });
      }
    });

    calls.sort((a,b) => {
      const ta = a.data.createdAt?.toMillis?.() || 0;
      const tb = b.data.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    if (!calls.length) {
      hideIncoming();
      incomingId = null;
      incomingData = null;
      return;
    }

    const next = calls[0];
    if (incomingId !== next.id) {
      incomingId = next.id;
      showIncoming(next.data);
    }
  }, e => {
    console.error("[TUBAL HUB] incoming call listener", e);
  });
}

function addButtons(){
  const list = $("memberList");
  if (!list || !isReal()) return;

  list.querySelectorAll(".member").forEach(div => {
    const uid = div.dataset.uid;
    if (!uid || uid === user.uid || div.querySelector(".vc-call-btn")) return;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "vc-call-btn";
    b.title = "Video call";
    b.textContent = "📹";
    b.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const name = div.querySelector(".member-info b")?.textContent || "Member";
      const img = div.querySelector(".mini img");
      console.log("[TUBAL HUB] Video call button clicked:", uid, name);
      startCall({ uid, displayName: name, photoURL: img?.src || "" });
    }, {capture:true});
    b.addEventListener("pointerdown", e => {
      e.stopPropagation();
    }, {capture:true});
    div.appendChild(b);
  });
}

async function toggleMute(){
  const track = localStream?.getAudioTracks?.()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("vcMute").classList.toggle("off", !track.enabled);
  $("vcMute").querySelector("span").textContent = track.enabled ? "Mute" : "Unmute";
}

async function toggleCamera(){
  const track = localStream?.getVideoTracks?.()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("vcCamera").classList.toggle("off", !track.enabled);
  $("vcCamera").querySelector("span").textContent = track.enabled ? "Camera" : "Camera off";
}

async function switchCamera(){
  const videoTrack = localStream?.getVideoTracks?.()[0];
  if (!videoTrack) return;
  const settings = videoTrack.getSettings?.() || {};
  const facing = settings.facingMode === "user" ? "environment" : "user";

  try {
    const next = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing }
    });
    const nextTrack = next.getVideoTracks()[0];
    const sender = peer?.getSenders?.().find(s => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(nextTrack);
    videoTrack.stop();
    localStream.removeTrack(videoTrack);
    localStream.addTrack(nextTrack);
    attachLocal(localStream);
  } catch (e) {
    console.warn("[TUBAL HUB] switch camera", e);
  }
}

function observeMembers(){
  const list = $("memberList");
  if (!list) return;
  new MutationObserver(addButtons).observe(list, { childList:true, subtree:true });
  addButtons();
}

injectUI();
enableLocalVideoDrag();
observeMembers();

onAuthStateChanged(auth, u => {
  user = u || null;

  if (!isReal()) {
    if (stopIncoming) {
      stopIncoming();
      stopIncoming = null;
    }
    if (callRef) endCall(true);
    hideIncoming();
    return;
  }

  watchIncoming();
  addButtons();
  // Notification permission/token setup is triggered by the user interaction above.
  setupCallPush();
});

window.addEventListener("tubalhub-private-call", e => {
  const target = e.detail;
  if (target?.uid && typeof startCall === "function") startCall(target);
});
