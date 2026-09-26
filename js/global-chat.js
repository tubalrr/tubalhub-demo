/* TUBAL HUB — GLOBAL CHAT PREMIUM UI
   UI enhancement only. Real messages/presence/auth remain backed by the existing
   Firebase Global Chat implementation in pages/chat.html.
   No hardcoded community messages or fake online users are generated here.
*/
const TUBAL_VERSION_REAL = "1.2.16";

(() => {
  "use strict";

  const CHANNELS = {
    general: "Global Chat",
    "payapang-isip": "# payapang-isip",
    ctrlzone: "# ctrlzone",
    "shop-talk": "# shop-talk",
    announcements: "# announcements"
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function safeJson(raw, fallback = null) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function realUserName() {
    const keys = [
      "tubalhub_user_real",
      "tubal_username",
      "tubalhub_username_real",
      "user_real",
      "username"
    ];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = safeJson(raw, raw);
      const value =
        typeof parsed === "string"
          ? parsed
          : parsed?.nameReal || parsed?.displayName || parsed?.username || parsed?.name || "";
      const clean = String(value || "").trim();
      if (clean) return clean;
    }

    const profile = $("#profileName");
    return String(profile?.textContent || "").trim();
  }

  function wireSidebarToggle() {
    const toggle = $("#sidebarToggle");
    const rail = $("#chatLeftRail");
    if (!toggle || !rail || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";

    const setOpen = (open) => {
      const mobile = window.matchMedia?.("(max-width:900px)").matches;
      if (mobile) rail.classList.toggle("open", open);
      else rail.classList.toggle("global-chat-sidebar-collapsed", !open);
      toggle.classList.toggle("is-active", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    toggle.addEventListener("click", () => {
      const mobile = window.matchMedia?.("(max-width:900px)").matches;
      const open = mobile
        ? rail.classList.contains("open")
        : !rail.classList.contains("global-chat-sidebar-collapsed");
      setOpen(!open);
    });

    $("#closeLeftRail")?.addEventListener("click", () => setOpen(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && window.matchMedia?.("(max-width:900px)").matches) {
        setOpen(false);
      }
    });

    window.addEventListener("resize", () => {
      if (!window.matchMedia?.("(max-width:900px)").matches) {
        rail.classList.remove("open");
        rail.classList.remove("global-chat-sidebar-collapsed");
        toggle.classList.remove("is-active");
        toggle.setAttribute("aria-expanded", "true");
      }
    }, { passive: true });

    // Desktop keeps the rail visible by default. Mobile starts closed.
    if (window.matchMedia?.("(max-width:900px)").matches) setOpen(false);
    else setOpen(true);
  }

  function wireChannels() {
    const buttons = $$(".channelReal");
    if (!buttons.length) return;

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const channel = button.dataset.channel || "general";
        if (typeof window.tubalHubSetChatChannelReal === "function") {
          window.tubalHubSetChatChannelReal(channel);
        }
        const title = $("#globalChatChannelTitle");
        if (title) title.textContent = CHANNELS[channel] || "Global Chat";
      });
    });
  }

  async function loadVersionBadge() {
    const badge = $("#globalChatVersionBadge");
    const marker = $("#chatBuildMarkerReal");
    const title = $("#globalChatVersionTitle");

    let version = TUBAL_VERSION_REAL;
    let build = "2026-09-25_1216";

    try {
      const response = await fetch("../version.json?v=" + TUBAL_VERSION_REAL + "&t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("version " + response.status);
      const data = await response.json();
      if (String(data?.version || "").trim()) version = String(data.version).trim();
      if (String(data?.build || "").trim()) build = String(data.build).trim();
    } catch (_) {}

    if (badge) badge.textContent = "● LIVE v" + version;
    if (marker) marker.textContent = "Today • v" + version + " • build " + build;
    if (title) title.textContent = "Global Chat • v" + version;
  }

  function syncRealProfileHeader() {
    const name = realUserName();
    const profileName = $("#profileName");
    if (name && profileName && profileName.textContent.trim() !== name) profileName.textContent = name;

    const status = $("#profileStatus");
    if (status && /checking/i.test(status.textContent || "")) status.textContent = "● Online";
  }

  function closeLegacyHardcodedLabels() {
    // Prevent stale copy from older chat markup while retaining real Firebase data.
    const debug = $("#presenceDebug");
    if (debug && /checking/i.test(debug.textContent || "")) {
      debug.textContent = "Live presence • Firebase";
    }
  }

  function markPremium() {
    document.body.classList.add("global-chat-premium-ready");
  }

  function init() {
    markPremium();
    wireSidebarToggle();
    wireChannels();
    syncRealProfileHeader();
    closeLegacyHardcodedLabels();
    loadVersionBadge();

    window.addEventListener("storage", syncRealProfileHeader);
    window.addEventListener("focus", syncRealProfileHeader, { passive: true });

    // Do not fabricate a typing indicator. Only real Firebase events belong in chat.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

/* =========================================================
   TUBAL HUB REAL VIDEO MODAL
   No video.html/videos.html navigation. The modal only plays
   verified sources configured below; missing local MP4 files are
   never referenced, so this UI does not manufacture 404s.
   ========================================================= */
(() => {
  "use strict";

  const videosReal = [
    {
      idReal: "tubal_intro",
      titleReal: "TUBAL HUB — Three Brands One Hub Intro",
      descReal: "Official TUBAL HUB intro • owner-supplied YouTube source",
      thumbReal: "https://i.ytimg.com/vi/OJRTOKrbJgI/hqdefault.jpg",
      youtubeReal: "https://www.youtube.com/embed/OJRTOKrbJgI?si=bL3-LIkCThxFBL_E",
      isReal: true
    },
    {
      idReal: "payapang_guide",
      titleReal: "Payapang Isip — A quiet place for your thoughts",
      descReal: "Real Payapang Isip feature guide • video source not configured in repo",
      thumbReal: null,
      youtubeReal: null,
      localReal: null,
      isReal: true
    },
    {
      idReal: "ctrlzone_highlights",
      titleReal: "CTRLZONE — Games Highlights",
      descReal: "Real CTRLZONE catalog • local MP4 not present in repository",
      thumbReal: null,
      youtubeReal: null,
      localReal: null,
      isReal: true
    },
    {
      idReal: "community_feed",
      titleReal: "Community Feed — Real posts from browser",
      descReal: "Real Feeds feature • local MP4 not present in repository",
      thumbReal: null,
      youtubeReal: null,
      localReal: null,
      isReal: true
    }
  ];

  function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[ch]));
  }

  function pagePrefix() {
    return location.pathname.includes("/pages/") ? "../" : "";
  }

  function injectVideoButtonReal() {
    const existing = document.getElementById("videoBtnReal");
    if (existing) return existing;

    const candidates = [...document.querySelectorAll("a[href]")].filter(a => {
      const href = String(a.getAttribute("href") || "").toLowerCase();
      const text = String(a.textContent || "").trim().toLowerCase();
      return href === "video.html" || href.endsWith("/videos") || href.endsWith("videos.html") || text === "video" || text === "videos" || text.includes("▶ videos");
    });

    const target = candidates[0];
    if (!target) return null;

    const button = document.createElement("button");
    button.id = "videoBtnReal";
    button.type = "button";
    button.title = "TUBAL HUB Videos Real";
    button.setAttribute("aria-label", "Open TUBAL HUB Videos");
    button.className = target.className || "";
    button.textContent = "📹";
    button.style.cssText = "width:36px;height:36px;background:rgba(255,255,255,0.06);border:1px solid rgba(120,255,170,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;color:inherit;";
    target.replaceWith(button);
    return button;
  }

  function ensureVideoModalReal() {
    let modal = document.getElementById("videoModalReal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "videoModalReal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "videoModalTitleReal");
    modal.hidden = true;
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:2000;display:none;align-items:center;justify-content:center;padding:20px;";
    modal.innerHTML = `
      <div style="width:100%;max-width:1100px;background:rgba(8,20,12,.98);border:1px solid rgba(29,255,145,.2);border-radius:24px;overflow:hidden;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 100px rgba(0,0,0,.7);">
        <div style="padding:16px 20px;background:linear-gradient(135deg,#0a1f12,#1dff91);display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <b id="videoModalTitleReal" style="color:#020604;font-size:14px;">TUBAL HUB Videos • Real</b>
            <br><small style="color:#020604;opacity:.7;">Configured video sources only • no fake MP4 paths</small>
          </div>
          <button id="closeVideoReal" type="button" aria-label="Close videos" style="width:32px;height:32px;background:#020604;border:none;border-radius:50%;color:#fff;cursor:pointer;">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 320px;min-height:0;flex:1;overflow:hidden;">
          <div style="background:#000;aspect-ratio:16/9;position:relative;min-height:240px;">
            <iframe id="videoPlayerReal" title="TUBAL HUB Real Video Player" width="100%" height="100%" src="" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;display:none;"></iframe>
            <video id="localVideoPlayerReal" controls playsinline preload="metadata" style="width:100%;height:100%;display:none;position:absolute;inset:0;background:#000;"></video>
            <div id="videoPlaceholderReal" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;text-align:center;padding:24px;">
              <span style="font-size:48px;">📹</span>
              <strong>Select a real video</strong>
              <p style="margin:0;opacity:.65;font-size:12px;">Only configured YouTube or existing local MP4 sources can play here.</p>
            </div>
            <div id="videoStatusReal" style="position:absolute;left:12px;bottom:12px;padding:6px 9px;border:1px solid rgba(29,255,145,.2);border-radius:999px;background:rgba(0,0,0,.65);color:#1dff91;font-size:9px;font-weight:800;letter-spacing:.5px;display:none;"></div>
          </div>
          <div id="videoListReal" style="background:rgba(0,0,0,.3);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#closeVideoReal")?.addEventListener("click", closeVideoReal);
    modal.addEventListener("click", e => {
      if (e.target === modal) closeVideoReal();
    });
    return modal;
  }

  function renderVideoListReal() {
    const list = document.getElementById("videoListReal");
    if (!list) return;
    list.innerHTML = videosReal.map(v => {
      const playable = !!(v.youtubeReal || v.localReal);
      const thumb = v.thumbReal
        ? `<img src="${safeText(v.thumbReal)}" alt="" loading="lazy" style="width:72px;height:46px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.06);flex-shrink:0;" onerror="this.remove()">`
        : `<div aria-hidden="true" style="width:72px;height:46px;border-radius:8px;background:linear-gradient(135deg,#0a1f12,#16251c);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📹</div>`;
      return `
        <button type="button" data-video-id="${safeText(v.idReal)}" ${playable ? "" : "disabled"}
          style="width:100%;text-align:left;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:10px;display:flex;gap:10px;cursor:${playable ? "pointer" : "not-allowed"};opacity:${playable ? "1" : ".68"};transition:.2s;color:#fff;">
          ${thumb}
          <span style="display:block;flex:1;min-width:0;">
            <b style="font-size:11px;display:block;white-space:normal;line-height:1.25;">${safeText(v.titleReal)}</b>
            <small style="font-size:10px;opacity:.6;display:block;margin-top:3px;line-height:1.3;">${safeText(v.descReal)}</small>
            <span style="font-size:8px;background:rgba(29,255,145,.15);color:#1dff91;padding:2px 6px;border-radius:20px;margin-top:5px;display:inline-block;">REAL • ${v.youtubeReal ? "YouTube" : (v.localReal ? "Local" : "SOURCE PENDING")}</span>
          </span>
        </button>
      `;
    }).join("");

    list.querySelectorAll("[data-video-id]").forEach(btn => {
      btn.addEventListener("click", () => playVideoReal(btn.dataset.videoId));
      if (!btn.disabled) {
        btn.addEventListener("mouseenter", () => btn.style.borderColor = "rgba(29,255,145,.3)");
        btn.addEventListener("mouseleave", () => btn.style.borderColor = "rgba(255,255,255,.06)");
      }
    });
  }

  function playVideoReal(idReal) {
    const v = videosReal.find(x => x.idReal === idReal);
    if (!v) return;

    const iframe = document.getElementById("videoPlayerReal");
    const localVid = document.getElementById("localVideoPlayerReal");
    const placeholder = document.getElementById("videoPlaceholderReal");
    const status = document.getElementById("videoStatusReal");
    if (!iframe || !localVid || !placeholder) return;

    placeholder.style.display = "none";
    if (status) {
      status.style.display = "block";
      status.textContent = v.youtubeReal ? "REAL • YOUTUBE" : (v.localReal ? "REAL • LOCAL MP4" : "REAL • SOURCE PENDING");
    }

    if (v.youtubeReal) {
      localVid.pause();
      localVid.removeAttribute("src");
      localVid.style.display = "none";
      iframe.src = v.youtubeReal;
      iframe.style.display = "block";
    } else if (v.localReal) {
      iframe.src = "";
      iframe.style.display = "none";
      localVid.src = v.localReal;
      localVid.style.display = "block";
      localVid.load();
      localVid.play().catch(() => {});
    } else {
      iframe.src = "";
      localVid.pause();
      localVid.removeAttribute("src");
      localVid.style.display = "none";
      placeholder.innerHTML = `
        <span style="font-size:48px;">📹</span>
        <strong>Real source not configured yet</strong>
        <p style="margin:0;max-width:420px;opacity:.65;font-size:12px;">Walang owner-supplied YouTube URL o existing MP4 file sa repository para sa video na ito. Hindi ako gagamit ng placeholder o 404 path.</p>
      `;
      placeholder.style.display = "flex";
    }
  }

  function openVideoReal() {
    const button = document.getElementById("videoBtnReal");
    const modal = ensureVideoModalReal();
    if (!modal) return;
    renderVideoListReal();
    modal.hidden = false;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    button?.setAttribute("aria-expanded", "true");
  }

  function closeVideoReal() {
    const modal = document.getElementById("videoModalReal");
    const iframe = document.getElementById("videoPlayerReal");
    const localVid = document.getElementById("localVideoPlayerReal");
    const placeholder = document.getElementById("videoPlaceholderReal");
    const status = document.getElementById("videoStatusReal");
    if (!modal) return;

    if (iframe) iframe.src = "";
    if (localVid) {
      localVid.pause();
      localVid.removeAttribute("src");
      localVid.load();
      localVid.style.display = "none";
    }
    if (placeholder) {
      placeholder.innerHTML = `
        <span style="font-size:48px;">📹</span>
        <strong>Select a real video</strong>
        <p style="margin:0;opacity:.65;font-size:12px;">Only configured YouTube or existing local MP4 sources can play here.</p>
      `;
      placeholder.style.display = "flex";
    }
    if (status) status.style.display = "none";
    modal.style.display = "none";
    modal.hidden = true;
    document.body.style.overflow = "";
    document.getElementById("videoBtnReal")?.setAttribute("aria-expanded", "false");
  }

  function initVideoReal() {
    const button = injectVideoButtonReal();
    ensureVideoModalReal();
    if (button) {
      // Direct handler: the real top-bar button always opens the real video modal.
      button.dataset.videoReady = "1";
      button.onclick = openVideoReal;
      button.setAttribute("type", "button");
      button.setAttribute("aria-haspopup", "dialog");
    }

    // Delegation fallback: keeps the video button working if another UI script
    // replaces/re-renders the top bar button after this initializer runs.
    if (!document.documentElement.dataset.tubalVideoDelegationReady) {
      document.documentElement.dataset.tubalVideoDelegationReady = "1";
      document.addEventListener("click", event => {
        const target = event.target.closest?.("#videoBtnReal");
        if (!target) return;
        event.preventDefault();
        openVideoReal();
      }, true);
    }

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && document.getElementById("videoModalReal")?.style.display === "flex") closeVideoReal();
    });

    // Keep the 3-dash menu untouched; only add the video control behavior.
    const dash = document.getElementById("sidebarToggle") || document.getElementById("sidebarMenuTrigger");
    if (dash) dash.style.zIndex = "1002";
  }

  window.tubalHubVideoReal = Object.freeze({
    videosReal,
    open: openVideoReal,
    close: closeVideoReal,
    play: playVideoReal
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initVideoReal, { once: true });
  } else {
    initVideoReal();
  }
})();

/* Shared real moderation + rate-limit guard for Global Chat messages and replies. */
(() => {
  const BANNED_WORDS_REAL = [
    "fuck","fucking","shit","bitch","asshole","bastard","damn",
    "putangina","puta","gago","tanga","bobo","ulol","tarantado","leche","bwisit","buwisit","hayop","hinayupak",
    "p*tangina","p*tang ina","putang ina","g*go","t*nga","b*bo","bw3sit","bwesit"
  ];
  const normalize = (value) => String(value || "").toLowerCase().replace(/[0@]/g,"o").replace(/[1!|]/g,"i").replace(/[3]/g,"e").replace(/[4@]/g,"a").replace(/[$5]/g,"s").replace(/[7]/g,"t").replace(/[._*\-]+/g,"").replace(/\s+/g," ").trim();
  const escapeRegex = (value) => String(value).replace(/[.*+?^$()|[\]\\]/g,"\\$&");
  const patterns = BANNED_WORDS_REAL.map(word => new RegExp("(?<![a-z0-9])" + escapeRegex(word).replace(/\\s+/g,"\\\\s*") + "(?![a-z0-9])","i"));
  function moderateTextReal(textReal){
    const raw = String(textReal || "");
    if(!raw.trim()) return {allowed:false,reason:"Empty",cleanText:"",hadBadWord:false};
    const normalized = normalize(raw);
    const found = BANNED_WORDS_REAL.find((word,index) => patterns[index].test(raw) || patterns[index].test(normalized));
    if(!found) return {allowed:true,reason:"",cleanText:raw.trim(),hadBadWord:false};
    return {allowed:false,reason:found,cleanText:"",hadBadWord:true};
  }
  function isRateLimitedReal(uid){
    const safeUid = String(uid || "").trim();
    if(!safeUid) return false;
    const key = "tubalhub_ratelimit_" + safeUid;
    const now = Date.now();
    const last = Number(localStorage.getItem(key) || 0);
    if(now - last < 2000) return true;
    localStorage.setItem(key,String(now));
    return false;
  }
  window.tubalHubChatGuardReal = Object.freeze({moderateTextReal,isRateLimitedReal});
})();

/* =========================================================
   TUBAL HUB — GLOBAL CHAT STORAGE AUTO-CLEANUP REAL
   Client never lists the Storage bucket. Cleanup is requested
   through a trusted callable function to avoid browser CORS/list
   failures. Existing three-dash control remains untouched.
   ========================================================= */
(() => {
  "use strict";

  const MAX_IMAGES_REAL = 40;
  const MAX_SIZE_REAL = 8 * 1024 * 1024;
  const ALLOWED_MIME_REAL = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  let apiPromiseReal = null;

  async function apiReal() {
    if (!apiPromiseReal) {
      apiPromiseReal = Promise.all([
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js"),
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js"),
        import("../assets/js/firebase-config.js")
      ]).then(([storageMod, functionsMod, configMod]) => ({
        ...storageMod,
        app: configMod.app,
        auth: configMod.auth,
        functions: functionsMod.getFunctions(configMod.app),
        httpsCallable: functionsMod.httpsCallable
      }));
    }
    return apiPromiseReal;
  }

  async function autoDeleteOldReal() {
    try {
      const api = await apiReal();
      const user = api.auth?.currentUser;
      if (!user || user.isAnonymous) {
        return { didDelete: false, deleted: 0, beforeCount: 0, afterCount: 0 };
      }

      const cleanupFn = api.httpsCallable(api.functions, "cleanupGlobalChatMediaReal");
      const result = await cleanupFn({});
      const data = result?.data || {};
      return {
        didDelete: Number(data.deleted || 0) > 0,
        deleted: Number(data.deleted || 0),
        beforeCount: Number(data.beforeCount || 0),
        afterCount: Number(data.afterCount || 0)
      };
    } catch (error) {
      console.warn("Global Chat server cleanup unavailable:", error);
      return { didDelete: false, deleted: 0, beforeCount: 0, afterCount: 0, error };
    }
  }

  async function prepareUploadReal(file) {
    if (!file) throw new Error("NO_FILE");
    if (file.size > MAX_SIZE_REAL) throw new Error("FILE_TOO_LARGE");
    if (!ALLOWED_MIME_REAL.includes(file.type)) throw new Error("FILE_TYPE_NOT_ALLOWED");

    const cleanup = await autoDeleteOldReal();
    if (cleanup.didDelete) {
      showStorageNoticeReal("🧹 Auto-cleanup removed " + cleanup.deleted + " oldest Global Chat media before upload.");
    }
    return cleanup;
  }

  function showStorageNoticeReal(message) {
    const notice = document.getElementById("moderationNotice");
    if (!notice) return;
    notice.textContent = message;
    notice.className = "moderation-notice show";
    window.clearTimeout(window.__tubalHubStorageNoticeTimerReal);
    window.__tubalHubStorageNoticeTimerReal = window.setTimeout(() => notice.classList.remove("show"), 5000);
  }

  function setStorageBadgeReal(message) {
    const badge = document.getElementById("storageBadgeReal");
    if (badge) {
      badge.textContent = message;
      badge.title = "Firebase Storage cleanup: maximum 40 media files per authenticated member.";
    }
  }

  async function uploadAndCreateMediaReal(file, type) {
    const api = await apiReal();
    const user = api.auth?.currentUser;
    if (!user || user.isAnonymous) throw new Error("LOGIN_REQUIRED");

    await prepareUploadReal(file);

    const safe = String(file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = "global-chat/" + user.uid + "/" + Date.now() + "_" + safe;
    const storage = api.getStorage(api.app);
    const storageRef = api.ref(storage, path);

    let snapshot;
    try {
      snapshot = await api.uploadBytes(storageRef, file, { contentType: file.type });
    } catch (error) {
      if (error?.code !== "storage/quota-exceeded") throw error;
      const cleanup = await autoDeleteOldReal();
      if (!cleanup.deleted) throw error;
      showStorageNoticeReal("🧹 Storage quota cleanup completed. Retrying upload once.");
      snapshot = await api.uploadBytes(storageRef, file, { contentType: file.type });
    }

    const url = await api.getDownloadURL(snapshot.ref);
    const uid = user.uid;
    if (window.tubalHubChatGuardReal?.isRateLimitedReal?.(uid)) throw new Error("RATE_LIMIT");

    const input = document.getElementById("messageInput");
    const caption = type === "image" ? String(input?.value || "").trim() : "";
    const channelMap = {
      general: "global-chat",
      "payapang-isip": "payapang-isip",
      ctrlzone: "ctrlzone",
      "shop-talk": "shop-talk",
      announcements: "announcements"
    };
    const selected = document.querySelector(".channelReal.active")?.dataset.channel || "general";
    const displayName = user.displayName || user.email?.split("@")[0] || "Member";

    const firestoreMod = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    const db = firestoreMod.getFirestore(api.app);
    await firestoreMod.addDoc(firestoreMod.collection(db, "globalChats"), {
      uid,
      displayName,
      name: displayName,
      email: user.email || "",
      photoURL: user.photoURL || "",
      createdAt: firestoreMod.serverTimestamp(),
      text: caption,
      textReal: caption,
      type,
      mediaUrl: url,
      imageUrlReal: url,
      storagePath: path,
      storagePathReal: path,
      fileNameReal: safe.split("/").pop(),
      channel: channelMap[selected] || "global-chat",
      hasImageReal: type === "image",
      imageExpiredReal: false,
      isSticker: type === "gif"
    });

    if (input && type === "image") {
      input.value = "";
      input.focus();
    }

    if (type === "gif") {
      window.dispatchEvent(new CustomEvent("tubal-gif-uploaded", {
        detail: { url, storagePath: path, name: file.name || "GIF Sticker" }
      }));
      const picker = document.getElementById("gifStickerPicker");
      if (picker) {
        picker.classList.remove("is-open");
        picker.hidden = true;
      }
    }

    setStorageBadgeReal("Auto-cleanup active • max " + MAX_IMAGES_REAL);
    return { url, path };
  }

  function installUploadButtonBridgeReal() {
    const imageButton = document.getElementById("imageBtn");
    const imageInput = document.getElementById("imageInput");
    const gifButton = document.getElementById("gifBtn");
    const gifInput = document.getElementById("gifInput");
    const openPicker = (input, event) => {
      if (!input || input.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      input.click();
    };

    if (imageButton && !imageButton.dataset.storageClickReady) {
      imageButton.dataset.storageClickReady = "1";
      imageButton.type = "button";
      imageButton.addEventListener("click", event => openPicker(imageInput, event), true);
    }

    if (gifButton && !gifButton.dataset.storageClickReady) {
      gifButton.dataset.storageClickReady = "1";
      gifButton.type = "button";
      gifButton.addEventListener("click", event => openPicker(gifInput, event), true);
    }
  }

  function installMediaInputBridgeReal() {
    const imageInput = document.getElementById("imageInput");
    const gifInput = document.getElementById("gifInput");
    if (!imageInput && !gifInput) return;

    const bridge = async (event, type) => {
      event.stopImmediatePropagation();
      const target = event.currentTarget;
      const file = target?.files?.[0];
      if (!file) return;

      const sendButton = document.getElementById("sendButton");
      if (sendButton) sendButton.disabled = true;

      try {
        await uploadAndCreateMediaReal(file, type);
        showStorageNoticeReal("✅ Media uploaded successfully.");
      } catch (error) {
        console.error("Global Chat media upload failed:", error);
        const msg = error?.message;
        const code = error?.code;
        if (msg === "FILE_TOO_LARGE") showStorageNoticeReal("Maximum file size is 8 MB.");
        else if (msg === "FILE_TYPE_NOT_ALLOWED") showStorageNoticeReal("Image files only: JPG, PNG, WEBP, or GIF.");
        else if (msg === "RATE_LIMIT" || code === "functions/resource-exhausted") showStorageNoticeReal("Please wait a moment before sending another media item.");
        else if (msg === "LOGIN_REQUIRED" || code === "functions/unauthenticated") showStorageNoticeReal("Please login first.");
        else if (code === "storage/unauthorized" || code === "storage/unknown") showStorageNoticeReal("Firebase Storage access is unavailable. Check the Firebase billing plan and Storage Rules.");
        else showStorageNoticeReal("Media upload failed. Check Firebase Storage access and deployment.");
      } finally {
        if (sendButton) sendButton.disabled = false;
        target.value = "";
        setStorageBadgeReal("Auto-cleanup active • max " + MAX_IMAGES_REAL);
      }
    };

    if (imageInput && !imageInput.dataset.storageBridgeReady) {
      imageInput.dataset.storageBridgeReady = "1";
      imageInput.addEventListener("change", event => bridge(event, "image"), true);
    }
    if (gifInput && !gifInput.dataset.storageBridgeReady) {
      gifInput.dataset.storageBridgeReady = "1";
      gifInput.addEventListener("change", event => bridge(event, "gif"), true);
    }
  }

  function ensureStorageBadgeReal() {
    const existing = document.getElementById("storageBadgeReal");
    if (existing) return existing;
    const actions = document.querySelector(".center-actions");
    if (!actions) return null;

    const badge = document.createElement("span");
    badge.id = "storageBadgeReal";
    badge.style.cssText = "font-size:9px;opacity:.75;background:rgba(29,255,145,.1);padding:5px 8px;border-radius:20px;display:inline-block;margin-left:8px;white-space:nowrap;border:1px solid rgba(255,255,255,.08);";
    badge.textContent = "Auto-cleanup active • max 40";
    const membersButton = document.getElementById("openMembers");
    actions.insertBefore(badge, membersButton || actions.firstChild);
    return badge;
  }

  function initStorageReal() {
    if (!document.getElementById("chatContent")) return;
    if (!document.getElementById("globalMessageCount")) {
      const count = document.createElement("span");
      count.id = "globalMessageCount";
      count.hidden = true;
      document.body.appendChild(count);
    }
    ensureStorageBadgeReal();
    installUploadButtonBridgeReal();
    installMediaInputBridgeReal();
    setStorageBadgeReal("Auto-cleanup active • max " + MAX_IMAGES_REAL);
  }

  window.tubalHubStorageAutoDeleteReal = Object.freeze({
    MAX_IMAGES_REAL,
    MAX_SIZE_REAL,
    ALLOWED_MIME_REAL,
    autoDeleteOldReal,
    prepareUploadReal
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStorageReal, { once: true });
  } else {
    initStorageReal();
  }
})();

