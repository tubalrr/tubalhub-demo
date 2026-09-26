import { auth } from "./firebase-config.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { publishHubPost } from "./hub-content.js";

const HF_MODEL = "facebook/musicgen-small";
const HF_ENDPOINT = "https://router.huggingface.co/hf-inference/models/" + HF_MODEL;
const DB_NAME = "tubalhub-ai-music";
const DB_VERSION = 1;
const STORE = "tracks";
const LIKE_KEY = "tubalhub_real_likes";
const PLAY_KEY = "tubalhub_real_plays";
const LISTENER_KEY = "tubalhub_real_listeners";
const SESSION_KEY = "tubalhub-ai-listener-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = {
  tracks: [],
  filtered: [],
  currentId: null,
  currentUrl: null,
  selectedGenre: "Lo-fi Hip-Hop",
  duration: 60,
  mood: 50,
  loading: false,
  audioContext: null,
  analyser: null,
  sourceNode: null,
  drawFrame: 0,
  listenerTimer: null
};

const el = {
  prompt: $("#musicPrompt"), genreChips: $("#genreChips"), mood: $("#moodRange"), moodValue: $("#moodValue"),
  durationRow: $("#durationRow"), token: $("#hfToken"), showToken: $("#showToken"), generate: $("#generateMusic"),
  genState: $("#generationState"), genWave: $("#loadingWaveform"),
  visualizer: $("#visualizer"), playerEmpty: $("#playerEmpty"), audio: $("#audioPlayer"),
  playerTitle: $("#playerTitle"), playerMeta: $("#playerMeta"), playerState: $("#playerState"),
  playPause: $("#playPause"), prev: $("#prevTrack"), next: $("#nextTrack"), seek: $("#seekBar"),
  currentTime: $("#currentTime"), durationTime: $("#durationTime"), volume: $("#volumeBar"),
  listenerCount: $("#listenerCount"), like: $("#likeTrack"), share: $("#shareTrack"),
  download: $("#downloadTrack"), del: $("#deleteTrack"), playerNotice: $("#playerNotice"),
  library: $("#libraryList"), libraryCount: $("#libraryCount"), search: $("#librarySearch"), toast: $("#amToast")
};

function toast(message, error = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle("error", error);
  el.toast.classList.add("open");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove("open"), 2600);
}

function moodLabel(value) {
  if (value <= 20) return "Very happy";
  if (value <= 40) return "Happy";
  if (value <= 60) return "Balanced";
  if (value <= 80) return "Melancholic";
  return "Sad";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return mins + ":" + secs;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}

function titleFromPrompt(prompt) {
  const first = prompt.trim().split(/\n+/)[0].replace(/\s+/g, " ");
  return first ? first.slice(0, 76) : "Untitled generated track";
}

function detectExtension(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  return "audio";
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath:"id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("title", "title");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB unavailable."));
  });
}

async function dbPut(track) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(track);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Could not save audio."));
  });
  db.close();
}

async function dbGetAll() {
  const db = await openDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Could not read library."));
  });
  db.close();
  return rows.sort((a,b) => Number(b.createdAt) - Number(a.createdAt));
}

async function dbDelete(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Could not delete track."));
  });
  db.close();
}

async function dbGet(id) {
  const db = await openDb();
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Could not read track."));
  });
  db.close();
  return row;
}

function readObject(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isLiked(id) {
  const data = readObject(LIKE_KEY);
  return data[id] === true;
}

function setLiked(id, value) {
  const data = readObject(LIKE_KEY);
  if (value) data[id] = true;
  else delete data[id];
  writeObject(LIKE_KEY, data);
}

function getPlayCount(id) {
  const data = readObject(PLAY_KEY);
  return Number(data[id] || 0);
}

function incrementPlayCount(id) {
  const data = readObject(PLAY_KEY);
  data[id] = Number(data[id] || 0) + 1;
  writeObject(PLAY_KEY, data);
}

function updateListenerHeartbeat(id) {
  const now = Date.now();
  const listeners = readObject(LISTENER_KEY);
  listeners[SESSION_KEY] = { trackId:id, updatedAt:now };
  writeObject(LISTENER_KEY, listeners);
  cleanupListeners();
}

function clearListenerHeartbeat() {
  const listeners = readObject(LISTENER_KEY);
  delete listeners[SESSION_KEY];
  writeObject(LISTENER_KEY, listeners);
}

function cleanupListeners() {
  const now = Date.now();
  const listeners = readObject(LISTENER_KEY);
  let changed = false;
  Object.keys(listeners).forEach(key => {
    if (now - Number(listeners[key]?.updatedAt || 0) > 15000) {
      delete listeners[key];
      changed = true;
    }
  });
  if (changed) writeObject(LISTENER_KEY, listeners);
}

function activeListenerCount(id) {
  cleanupListeners();
  const listeners = readObject(LISTENER_KEY);
  const now = Date.now();
  return Object.values(listeners).filter(item => item.trackId === id && now - Number(item.updatedAt || 0) <= 15000).length;
}

async function refreshLibrary() {
  state.tracks = await dbGetAll();
  applyLibraryFilter();
}

function applyLibraryFilter() {
  const q = el.search.value.trim().toLowerCase();
  state.filtered = state.tracks.filter(track => !q || String(track.title || "").toLowerCase().includes(q));
  renderLibrary();
  updatePlayerNav();
}

function renderLibrary() {
  el.libraryCount.textContent = state.filtered.length + (state.filtered.length === 1 ? " track" : " tracks");
  if (!state.filtered.length) {
    el.library.innerHTML = '<div class="library-empty"><span class="emoji" aria-hidden="true">🎵</span><strong>Wala ka pang nagawa na kanta, mag generate ka muna</strong><small>Only real audio saved in this browser appears here.</small></div>';
    return;
  }

  el.library.innerHTML = state.filtered.map(track => {
    const liked = isLiked(track.id);
    return '<article class="track-row ' + (track.id === state.currentId ? "active" : "") + '" data-id="' + escapeHtml(track.id) + '">' +
      '<div class="track-thumb"><span class="emoji" aria-hidden="true">🎧</span></div>' +
      '<div class="track-copy"><strong>' + escapeHtml(track.title) + '</strong><small>' +
      escapeHtml(track.genre) + " • " + escapeHtml(moodLabel(track.mood)) + " • " + formatTime(track.duration || 0) +
      " • " + getPlayCount(track.id) + " plays" +
      '</small></div>' +
      '<div class="track-meta"><span>' + (track.sharedUrl ? "Shared" : "Local") + '</span><button type="button" data-like="' + escapeHtml(track.id) + '" class="' + (liked ? "liked" : "") + '" aria-label="' + (liked ? "Unlike" : "Like") + '">♡</button></div>' +
      '</article>';
  }).join("");
}

function updatePlayerUi(track) {
  const hasTrack = !!track;
  [el.playPause,el.prev,el.next,el.like,el.share,el.download,el.del].forEach(button => {
    button.disabled = !hasTrack;
  });
  if (!hasTrack) {
    el.playerTitle.textContent = "No track selected";
    el.playerMeta.textContent = "Create a real track to start playback.";
    el.playerState.textContent = "READY";
    el.playerEmpty.classList.remove("hidden");
    el.currentTime.textContent = "0:00";
    el.durationTime.textContent = "0:00";
    el.seek.max = "0";
    el.seek.value = "0";
    el.listenerCount.textContent = "0 active listener";
    return;
  }

  el.playerEmpty.classList.add("hidden");
  el.playerTitle.textContent = track.title;
  el.playerMeta.textContent = track.genre + " • " + moodLabel(track.mood) + " • " + detectExtension(track.mimeType).toUpperCase() + " • " + getPlayCount(track.id) + " plays";
  el.playerState.textContent = "READY";
  el.like.classList.toggle("liked", isLiked(track.id));
  el.like.querySelector(".emoji").textContent = isLiked(track.id) ? "♥" : "♡";
  el.listenerCount.textContent = activeListenerCount(track.id) + " active listener" + (activeListenerCount(track.id) === 1 ? "" : "s");
}

function buildPrompt() {
  const base = el.prompt.value.trim();
  if (!base) throw new Error("Describe your vibe first.");
  const mood = moodLabel(state.mood);
  return base + ". Genre: " + state.selectedGenre + ". Mood direction: " + mood + ". Instrumental music, no vocals.";
}

function setGenerationState(message, mode = "") {
  el.genState.classList.remove("loading","error");
  if (mode) el.genState.classList.add(mode);
  el.genState.innerHTML = '<span class="state-light" aria-hidden="true"></span><span>' + escapeHtml(message) + '</span>';
}

async function parseHfError(response) {
  const type = response.headers.get("content-type") || "";
  try {
    if (type.includes("application/json")) {
      const data = await response.json();
      return data.error || data.message || ("Generation failed (" + response.status + ").");
    }
    const text = await response.text();
    return text.slice(0, 400) || ("Generation failed (" + response.status + ").");
  } catch {
    return "Generation failed (" + response.status + ").";
  }
}

async function generateMusic() {
  if (state.loading) return;
  const token = el.token.value.trim();
  if (!token) {
    setGenerationState("A real Hugging Face API key is required for generation.", "error");
    toast("No API key. Generation is not mocked.", true);
    el.token.focus();
    return;
  }

  let prompt;
  try { prompt = buildPrompt(); }
  catch (error) {
    setGenerationState(error.message, "error");
    toast(error.message, true);
    el.prompt.focus();
    return;
  }

  state.loading = true;
  el.generate.disabled = true;
  el.genWave.hidden = false;
  setGenerationState("Generating with Hugging Face MusicGen. This can take a while for longer audio.", "loading");
  el.playerState.textContent = "GENERATING";
  el.playerNotice.textContent = "";

  try {
    const maxNewTokens = Math.max(1500, Math.min(6000, state.duration * 50));
    const response = await fetch(HF_ENDPOINT, {
      method:"POST",
      headers:{
        "Authorization":"Bearer " + token,
        "Content-Type":"application/json",
        "Accept":"audio/*,application/json"
      },
      body:JSON.stringify({
        inputs:prompt,
        parameters:{max_new_tokens:maxNewTokens}
      })
    });

    if (!response.ok) throw new Error(await parseHfError(response));

    const contentType = response.headers.get("content-type") || "";
    let blob;

    if (contentType.includes("application/json")) {
      const data = await response.json();
      const encoded = data.audio || data.data || data.blob;
      if (typeof encoded !== "string") throw new Error("Hugging Face returned JSON without audio bytes.");
      const binary = atob(encoded.includes(",") ? encoded.split(",").pop() : encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
      blob = new Blob([bytes], {type:data.mime_type || "audio/wav"});
    } else {
      blob = await response.blob();
    }

    if (!blob.size) throw new Error("The provider returned an empty audio file.");

    const id = crypto.randomUUID ? crypto.randomUUID() : "track-" + Date.now();
    const title = titleFromPrompt(el.prompt.value);
    const mimeType = blob.type || "audio/wav";
    const track = {
      id,title,genre:state.selectedGenre,mood:state.mood,duration:state.duration,
      prompt:el.prompt.value.trim(),mimeType,blob,createdAt:Date.now(),sharedUrl:""
    };

    await dbPut(track);
    await refreshLibrary();
    await selectTrack(id, false);
    setGenerationState("Real audio saved to IndexedDB.", "");
    toast("Generated audio saved locally.");
  } catch (error) {
    console.error("[AI Music] generation failed", error);
    setGenerationState(error.message || "Generation failed.", "error");
    el.playerState.textContent = "ERROR";
    toast(error.message || "Generation failed.", true);
  } finally {
    state.loading = false;
    el.generate.disabled = false;
    el.genWave.hidden = true;
  }
}

async function selectTrack(id, autoplay = false) {
  const track = await dbGet(id);
  if (!track) {
    toast("That audio is no longer in the local library.", true);
    await refreshLibrary();
    return;
  }

  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentUrl = URL.createObjectURL(track.blob);
  state.currentId = id;
  el.audio.src = state.currentUrl;
  el.audio.load();
  el.playerState.textContent = "READY";
  el.playerNotice.textContent = "";
  updatePlayerUi(track);
  applyLibraryFilter();
  if (autoplay) {
    try {
      await el.audio.play();
    } catch (error) {
      toast("Press Play to start audio playback.", true);
    }
  }
}

function currentTrack() {
  return state.tracks.find(track => track.id === state.currentId) || null;
}

function currentIndex() {
  return state.tracks.findIndex(track => track.id === state.currentId);
}

function updatePlayerNav() {
  const i = currentIndex();
  const has = i >= 0;
  el.prev.disabled = !has || state.tracks.length < 2;
  el.next.disabled = !has || state.tracks.length < 2;
}

async function playPause() {
  if (!currentTrack()) return;
  try {
    if (el.audio.paused) {
      await setupAnalyser();
      await el.audio.play();
    } else {
      el.audio.pause();
    }
  } catch (error) {
    el.playerNotice.textContent = error.message || "Audio could not start.";
    el.playerNotice.classList.add("error");
  }
}

async function setupAnalyser() {
  if (state.analyser || !window.AudioContext && !window.webkitAudioContext) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  state.audioContext = new Ctx();
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 128;
  state.analyser.smoothingTimeConstant = 0.78;
  state.sourceNode = state.audioContext.createMediaElementSource(el.audio);
  state.sourceNode.connect(state.analyser);
  state.analyser.connect(state.audioContext.destination);
  if (state.audioContext.state === "suspended") await state.audioContext.resume();
  drawVisualizer();
}

function drawVisualizer() {
  cancelAnimationFrame(state.drawFrame);
  const canvas = el.visualizer;
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(state.analyser ? state.analyser.frequencyBinCount : 64);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function frame() {
    state.drawFrame = requestAnimationFrame(frame);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;canvas.height = height;
    }
    ctx.clearRect(0,0,width,height);
    if (!state.analyser) return;

    state.analyser.getByteFrequencyData(data);
    const bars = Math.min(64, data.length);
    const gap = Math.max(2, width / 500);
    const barWidth = Math.max(2, (width - gap*(bars-1)) / bars);

    for (let i=0;i<bars;i++) {
      const amp = data[i] / 255;
      const barH = Math.max(2, amp * height * .86);
      const x = i * (barWidth + gap);
      const y = height - barH;
      const grad = ctx.createLinearGradient(0,y,0,height);
      grad.addColorStop(0,"#1dff91");
      grad.addColorStop(.58,"#8ed66d");
      grad.addColorStop(1,"#7d5aff");
      ctx.fillStyle = grad;
      ctx.fillRect(x,y,barWidth,barH);
    }
  }
  frame();
}

function updatePlayButton() {
  const playing = !el.audio.paused && !el.audio.ended;
  el.playPause.textContent = playing ? "❚❚" : "▶";
  if (currentTrack()) el.playerState.textContent = playing ? "PLAYING" : "READY";
  if (playing) {
    updateListenerHeartbeat(state.currentId);
    clearInterval(state.listenerTimer);
    state.listenerTimer = setInterval(() => {
      if (!el.audio.paused && currentTrack()) updateListenerHeartbeat(state.currentId);
      updateListenerUi();
    }, 5000);
  } else {
    clearInterval(state.listenerTimer);
    state.listenerTimer = null;
    clearListenerHeartbeat();
  }
}

function updateListenerUi() {
  const count = state.currentId ? activeListenerCount(state.currentId) : 0;
  el.listenerCount.textContent = count + " active listener" + (count === 1 ? "" : "s");
}

function onTimeUpdate() {
  if (!Number.isFinite(el.audio.duration)) return;
  el.currentTime.textContent = formatTime(el.audio.currentTime);
  el.durationTime.textContent = formatTime(el.audio.duration);
  el.seek.max = String(el.audio.duration);
  el.seek.value = String(el.audio.currentTime);
}

async function onEnded() {
  if (state.currentId) incrementPlayCount(state.currentId);
  if (state.currentId) {
    const track = await dbGet(state.currentId);
    if (track) updatePlayerUi(track);
  }
  clearListenerHeartbeat();
  updatePlayButton();
  await refreshLibrary();
  const nextIndex = currentIndex() + 1;
  if (nextIndex < state.tracks.length) await selectTrack(state.tracks[nextIndex].id, true);
}

async function goRelative(step) {
  const i = currentIndex();
  if (i < 0 || state.tracks.length < 2) return;
  const nextIndex = (i + step + state.tracks.length) % state.tracks.length;
  await selectTrack(state.tracks[nextIndex].id, true);
}

async function toggleLike() {
  const track = currentTrack();
  if (!track) return;
  const value = !isLiked(track.id);
  setLiked(track.id, value);
  updatePlayerUi(track);
  renderLibrary();
  toast(value ? "Liked this real track." : "Like removed.");
}

async function downloadCurrent() {
  const track = currentTrack();
  if (!track) return;
  const ext = detectExtension(track.mimeType);
  const url = URL.createObjectURL(track.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tubal-hub-" + track.id + "." + ext;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareCurrent() {
  const track = currentTrack();
  if (!track) return;
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    toast("Sign in to TUBAL HUB before sharing to Feeds.", true);
    return;
  }

  const originalText = el.share.textContent;
  el.share.disabled = true;
  el.playerNotice.textContent = "Uploading this real audio file to Firebase Storage for the Feeds post…";

  try {
    const ext = detectExtension(track.mimeType);
    const path = "ai-music/" + user.uid + "/" + track.id + "." + ext;
    const ref = storageRef(getStorage(), path);
    const upload = await uploadBytes(ref, track.blob, {contentType:track.mimeType});
    const mediaUrl = await getDownloadURL(upload.ref);
    await publishHubPost({
      contentType:"audio",
      title:track.title,
      text:"AI Music • " + track.genre + " • " + moodLabel(track.mood),
      mediaUrl,
      category:"AI Music",
      authorName:user.displayName || user.email?.split("@")[0] || "Member",
      authorPhotoURL:user.photoURL || "",
      createdBy:user.uid,
      sourceCollection:"aiMusic",
      sourceId:track.id,
      destinations:["feeds"]
    });
    track.sharedUrl = mediaUrl;
    await dbPut(track);
    await refreshLibrary();
    el.playerNotice.textContent = "Shared to Feeds with the real uploaded audio player.";
    toast("Real track shared to Feeds.");
  } catch (error) {
    console.error("[AI Music] share failed", error);
    el.playerNotice.textContent = error.message || "Could not share audio.";
    el.playerNotice.classList.add("error");
    toast(error.message || "Could not share audio.", true);
  } finally {
    el.share.disabled = false;
    el.share.textContent = originalText;
  }
}

async function deleteCurrent() {
  const track = currentTrack();
  if (!track) return;
  if (!window.confirm("Delete this locally saved track from IndexedDB?")) return;
  el.audio.pause();
  clearListenerHeartbeat();
  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentUrl = null;
  await dbDelete(track.id);
  state.currentId = null;
  el.audio.removeAttribute("src");
  el.audio.load();
  updatePlayerUi(null);
  await refreshLibrary();
  toast("Track deleted from this browser.");
}

function bind() {
  $$(".genre-chip").forEach(button => button.addEventListener("click", () => {
    $$(".genre-chip").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    state.selectedGenre = button.dataset.genre;
  }));

  $$("#durationRow button").forEach(button => button.addEventListener("click", () => {
    $$("#durationRow button").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    state.duration = Number(button.dataset.duration);
  }));

  el.mood.addEventListener("input", () => {
    state.mood = Number(el.mood.value);
    el.moodValue.textContent = moodLabel(state.mood);
  });

  el.showToken.addEventListener("click", () => {
    const showing = el.token.type === "text";
    el.token.type = showing ? "password" : "text";
    el.showToken.textContent = showing ? "Show" : "Hide";
  });

  el.generate.addEventListener("click", generateMusic);
  el.playPause.addEventListener("click", playPause);
  el.prev.addEventListener("click", () => goRelative(-1));
  el.next.addEventListener("click", () => goRelative(1));
  el.like.addEventListener("click", toggleLike);
  el.download.addEventListener("click", downloadCurrent);
  el.share.addEventListener("click", shareCurrent);
  el.del.addEventListener("click", deleteCurrent);

  el.audio.addEventListener("play", updatePlayButton);
  el.audio.addEventListener("pause", updatePlayButton);
  el.audio.addEventListener("timeupdate", onTimeUpdate);
  el.audio.addEventListener("loadedmetadata", onTimeUpdate);
  el.audio.addEventListener("ended", onEnded);
  el.audio.addEventListener("error", () => {
    el.playerNotice.textContent = "The audio file could not be played by this browser.";
    el.playerNotice.classList.add("error");
    updatePlayButton();
  });

  el.seek.addEventListener("input", () => {
    if (Number.isFinite(el.audio.duration)) el.audio.currentTime = Number(el.seek.value);
  });
  el.volume.addEventListener("input", () => { el.audio.volume = Number(el.volume.value); });

  el.library.addEventListener("click", async event => {
    const row = event.target.closest(".track-row");
    const like = event.target.closest("[data-like]");
    if (like) {
      event.preventDefault();event.stopPropagation();
      const id = like.dataset.like;setLiked(id,!isLiked(id));renderLibrary();
      if (id === state.currentId) updatePlayerUi(currentTrack());
      toast(isLiked(id) ? "Liked this real track." : "Like removed.");
      return;
    }
    if (row) await selectTrack(row.dataset.id, true);
  });

  el.search.addEventListener("input", applyLibraryFilter);

  window.addEventListener("storage", event => {
    if (event.key === LISTENER_KEY) updateListenerUi();
    if (event.key === LIKE_KEY || event.key === PLAY_KEY) {
      renderLibrary();
      const track = currentTrack();
      if (track) updatePlayerUi(track);
    }
  });

  window.addEventListener("beforeunload", () => {
    clearListenerHeartbeat();
    if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
    cancelAnimationFrame(state.drawFrame);
    try { state.audioContext?.close(); } catch {}
  });
}

function initThemes() {
  const apply = theme => {
    const value = ["midnight","forest","light"].includes(theme) ? theme : "midnight";
    document.body.classList.remove("theme-midnight","theme-forest","theme-light");
    document.body.classList.add("theme-" + value);
    $$(".am-themes button").forEach(button => button.classList.toggle("active", button.dataset.theme === value));
  };
  apply(localStorage.getItem("tubalhub-theme") || "midnight");
  $$(".am-themes button").forEach(button => button.addEventListener("click", () => {
    const value = button.dataset.theme;
    localStorage.setItem("tubalhub-theme", value);
    apply(value);
    window.dispatchEvent(new CustomEvent("tubalhubthemechange",{detail:value}));
  }));
  window.addEventListener("tubalhubthemechange", () => apply(localStorage.getItem("tubalhub-theme") || "midnight"));
}

async function init() {
  initThemes();
  el.audio.volume = Number(el.volume.value);
  try {
    await refreshLibrary();
  } catch (error) {
    el.library.innerHTML = '<div class="library-empty"><span class="emoji">⚠️</span><strong>IndexedDB is unavailable in this browser.</strong><small>Generated audio cannot be saved without local storage support.</small></div>';
    el.libraryCount.textContent = "0 tracks";
  }
  bind();
  updatePlayerNav();
}

init();
