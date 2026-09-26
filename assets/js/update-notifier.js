(() => {
  if (window.__tubalHubUpdateNotifierLoaded) return;
  window.__tubalHubUpdateNotifierLoaded = true;

  const script = document.currentScript;
  const scriptUrl = script ? new URL(script.src, document.baseURI) : new URL("assets/js/update-notifier.js", document.baseURI);
  const rootPath = scriptUrl.pathname.replace(/\/assets\/js\/update-notifier\.js$/,"/");
  const rootUrl = new URL(rootPath || "./", scriptUrl.origin + "/");
  const versionUrl = new URL("version.json", rootUrl).href;
  const componentUrl = new URL("components/update-modal.html", rootUrl).href;
  const cssUrl = new URL("assets/css/update-notifier.css", rootUrl).href;

  const LAST_SEEN_KEY = "tubalhub_last_seen_version";
  const LEGACY_VERSION_KEY = "tubalhub_version";
  const UPDATE_KEY = "tubalhub_has_update";
  const EVENT_KEY = "tubalhub_update_event";
  const NATIVE_EVENT_KEY = "tubalhub_last_native_update";
  const UPDATES_ENABLED_KEY = "tubalhub_notif_website_updates";
  const POLL_MS = 10000;
  const TOAST_MS = 6000;

  let loadedUi = false;
  let pollTimer = null;
  let toastTimer = null;
  let channel = null;
  let currentData = null;
  let updateAvailable = false;
  let modalOpen = false;

  const $ = id => document.getElementById(id);
  const updatesEnabled = () => localStorage.getItem(UPDATES_ENABLED_KEY) !== "0";

  function ensureCss() {
    if (document.querySelector("link[data-tubal-update-css]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl + "?v=" + Date.now();
    link.dataset.tubalUpdateCss = "1";
    document.head.appendChild(link);
  }

  function ensureVersionLink() {
    if (document.querySelector("link[data-tubal-version-json]")) return;
    const link = document.createElement("link");
    link.rel = "alternate";
    link.type = "application/json";
    link.href = versionUrl;
    link.dataset.tubalVersionJson = "1";
    document.head.appendChild(link);
  }

  function ensureFallbackUi() {
    if ($("thUpdateToast") || $("thUpdateModal")) return;
    let holder = $("update-banner");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "update-banner";
      document.body.prepend(holder);
    }
    holder.innerHTML =
      '<div class="th-update-system" id="thUpdateSystemFallback" aria-live="polite">' +
        '<div class="th-update-toast" id="thUpdateToast" hidden>' +
          '<div class="th-update-toast-icon" aria-hidden="true"><span>✨</span></div>' +
          '<div class="th-update-toast-copy"><strong id="thUpdateToastTitle">May bago!</strong><span id="thUpdateToastMessage"></span></div>' +
          '<button class="th-update-toast-close" id="thUpdateToastClose" type="button" aria-label="Close update notice">×</button>' +
          '<div class="th-update-toast-progress" aria-hidden="true"><i id="thUpdateToastProgress"></i></div>' +
        '</div>' +
        '<div class="th-update-overlay" id="thUpdateOverlay" hidden>' +
          '<section class="th-update-modal" id="thUpdateModal" role="dialog" aria-modal="true" aria-labelledby="thUpdateTitle">' +
            '<header class="th-update-modal-header"><div><span class="th-update-kicker">🎉 TUBAL HUB UPDATE</span><h2 id="thUpdateTitle">Ano Bago sa Update</h2><p id="thUpdateDate">Date unavailable</p></div><button class="th-update-close" id="thUpdateClose" type="button" aria-label="Close update">×</button></header>' +
            '<main class="th-update-modal-body"><div class="th-update-intro"><span class="th-update-version" id="thUpdateVersion">v—</span><span id="thUpdateIntroText">Real changes from the current TUBAL HUB release.</span></div><div class="th-update-changelog" id="thUpdateChangelog"></div></main>' +
            '<footer class="th-update-modal-footer"><button class="th-update-primary" id="thUpdateWhatsNew" type="button">What\'s New</button><button class="th-update-secondary" id="thUpdateDismiss" type="button">Dismiss</button></footer>' +
          '</section>' +
        '</div>' +
        '<div class="th-version-badge" id="thVersionBadge"><span class="th-version-dot" aria-hidden="true"></span><span id="thVersionText">v—</span></div>' +
      '</div>';
  }

  async function loadUi() {
    ensureCss();
    ensureVersionLink();
    if (document.querySelector("#thUpdateModal")) {
      loadedUi = true;
      ensureBell();
      bindUi();
      return true;
    }
    let holder = document.querySelector("#update-banner");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "update-banner";
      document.body.prepend(holder);
    }
    try {
      const response = await fetch(componentUrl, {cache:"no-store"});
      if (!response.ok) throw new Error("Update modal unavailable: " + response.status);
      holder.innerHTML = await response.text();
    } catch (error) {
      console.warn("[TUBAL HUB update notifier] component load failed, using fallback:", error);
      ensureFallbackUi();
    }
    loadedUi = true;
    ensureBell();
    bindUi();
    setVersionBadge(localStorage.getItem(LAST_SEEN_KEY) || localStorage.getItem(LEGACY_VERSION_KEY) || "—");
    return true;
  }

  function ensureBell() {
    document.querySelectorAll(".notification-btn").forEach(button => {
      let icon = button.querySelector(".th-update-bell-icon");
      if (!icon) {
        icon = document.createElement("span");
        icon.className = "th-update-bell-icon";
        icon.textContent = "🔔";
        icon.setAttribute("aria-hidden","true");
        const svg = button.querySelector("svg");
        if (svg) svg.style.display = "none";
        button.appendChild(icon);
      }
      let dot = button.querySelector(".th-update-bell-dot");
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "th-update-bell-dot";
        dot.hidden = !updateAvailable;
        dot.setAttribute("aria-hidden","true");
        button.appendChild(dot);
      }
      button.classList.add("th-update-bell-ready");
    });
  }

  function setBellState(enabled) {
    updateAvailable = Boolean(enabled);
    document.querySelectorAll(".th-update-bell-dot").forEach(dot => dot.hidden = !updateAvailable);
    document.querySelectorAll(".notification-btn").forEach(button => {
      button.classList.toggle("th-update-has-update", updateAvailable);
    });
  }

  function setVersionBadge(version) {
    const text = $("thVersionText");
    if (text) text.textContent = "v" + (version || "—");
  }

  function normalize(data) {
    const changelog = Array.isArray(data?.changelog) ? data.changelog.map(item => ({
      type: String(item?.type || "Updated"),
      icon: String(item?.icon || "•"),
      title: String(item?.title || "Update"),
      desc: String(item?.desc || "")
    })).filter(item => item.title && item.desc) : [];
    return {
      version: String(data?.version || ""),
      date: String(data?.date || data?.time || ""),
      time: String(data?.time || ""),
      message: String(data?.message || ""),
      changelog
    };
  }

  function validate(data) {
    if (!data.version) throw new Error("version.json missing version");
    if (!data.changelog.length) throw new Error("version.json missing changelog");
    return data;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "Date unavailable";
    return date.toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
  }

  function toastMessage(data) {
    const titles = data.changelog.slice(0,2).map(item => item.title).filter(Boolean);
    return "May bago! " + (titles.length ? titles.join(" at ") : "TUBAL HUB update");
  }

  function renderModal(data) {
    const title = $("thUpdateTitle");
    const date = $("thUpdateDate");
    const version = $("thUpdateVersion");
    const intro = $("thUpdateIntroText");
    const list = $("thUpdateChangelog");
    if (!title || !date || !version || !intro || !list) return;

    title.textContent = "Ano Bago sa Update v" + data.version;
    date.textContent = formatDate(data.date || data.time);
    version.textContent = "v" + data.version;
    intro.textContent = data.message || "Real changes from this release.";

    list.innerHTML = data.changelog.map(item => {
      const type = item.type === "Improved" || item.type === "Fixed" ? item.type : "New";
      return '<article class="th-update-card" data-type="' + escapeHtml(type) + '">' +
        '<div class="th-update-card-top">' +
          '<span class="th-update-card-icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
          '<span class="th-update-type" data-type="' + escapeHtml(type) + '">' + escapeHtml(type) + '</span>' +
        '</div>' +
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        '<p>' + escapeHtml(item.desc) + '</p>' +
      '</article>';
    }).join("");

    const toastTitle = $("thUpdateToastTitle");
    const toastMessageEl = $("thUpdateToastMessage");
    if (toastTitle) toastTitle.textContent = "May bago!";
    if (toastMessageEl) toastMessageEl.textContent = toastMessage(data);
    setVersionBadge(data.version);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function openModal() {
    if (!currentData) return;
    renderModal(currentData);
    const overlay = $("thUpdateOverlay"), modal = $("thUpdateModal");
    if (!overlay || !modal) return;
    overlay.hidden = false;
    modalOpen = true;
    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      modal.classList.add("is-open");
    });
  }

  function closeModal() {
    const overlay = $("thUpdateOverlay"), modal = $("thUpdateModal");
    if (!overlay || !modal) return;
    modal.classList.remove("is-open");
    overlay.classList.remove("is-open");
    modalOpen = false;
    setTimeout(() => {
      if (!modalOpen) overlay.hidden = true;
    }, 260);
  }

  function showToast() {
    const toast = $("thUpdateToast");
    if (!toast || !currentData) return;
    renderModal(currentData);
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("is-open"));
    const progress = $("thUpdateToastProgress");
    progress?.classList.remove("is-running");
    void progress?.offsetWidth;
    progress?.classList.add("is-running");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    const toast = $("thUpdateToast");
    if (!toast) return;
    toast.classList.remove("is-open");
    clearTimeout(toastTimer);
    setTimeout(() => {
      if (!toast.classList.contains("is-open")) toast.hidden = true;
    }, 220);
  }

  async function sendNativeNotification(data) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const eventKey = data.version + "|" + (data.date || data.time || "");
    if (localStorage.getItem(NATIVE_EVENT_KEY) === eventKey) return;
    try {
      new Notification("TUBAL HUB • v" + data.version, {
        body: toastMessage(data),
        icon: new URL("tubal-hub-logo.png", rootUrl).href,
        tag: "tubalhub-website-update-" + data.version
      });
      localStorage.setItem(NATIVE_EVENT_KEY, eventKey);
    } catch (_) {}
  }

  function postChannel(payload) {
    try {
      channel?.postMessage(payload);
    } catch (_) {}
  }

  function markSeen(options={}) {
    if (!currentData) return;
    localStorage.setItem(LAST_SEEN_KEY, currentData.version);
    localStorage.setItem(LEGACY_VERSION_KEY, currentData.version);
    localStorage.removeItem(UPDATE_KEY);
    setBellState(false);
    setVersionBadge(currentData.version);
    if (!options.broadcast) postChannel({type:"website-update-seen",version:currentData.version});
  }

  function showUpdate(data, source="poll") {
    if (!updatesEnabled() || !data?.version) return;
    const eventKey = data.version + "|" + (data.date || data.time || "");
    const alreadyActive = currentData?.version === data.version && updateAvailable;
    currentData = data;
    localStorage.setItem(UPDATE_KEY,"true");
    localStorage.setItem(EVENT_KEY,eventKey);
    setBellState(true);
    renderModal(data);
    if (!alreadyActive) showToast();
    if (source !== "broadcast") {
      postChannel({type:"website-update",data});
      sendNativeNotification(data);
    }
  }

  function compare(data) {
    const seen = localStorage.getItem(LAST_SEEN_KEY);
    setVersionBadge(seen || data.version || "—");
    if (seen !== data.version) {
      showUpdate(data);
    } else {
      currentData = data;
      setBellState(false);
      localStorage.removeItem(UPDATE_KEY);
      setVersionBadge(data.version);
    }
  }

  async function fetchVersion() {
    const response = await fetch(versionUrl + "?t=" + Date.now(), {cache:"no-store"});
    if (!response.ok) throw new Error("version.json " + response.status);
    return validate(normalize(await response.json()));
  }

  async function poll() {
    if (!updatesEnabled()) return;
    try {
      compare(await fetchVersion());
    } catch (error) {
      console.warn("[TUBAL HUB update check]", error);
    }
  }

  async function markSeenAndClose() {
    markSeen();
    closeModal();
    hideToast();
  }

  function bindUi() {
    $("thUpdateClose")?.addEventListener("click",closeModal);
    $("thUpdateDismiss")?.addEventListener("click",closeModal);
    $("thUpdateWhatsNew")?.addEventListener("click",markSeenAndClose);
    $("thUpdateToastClose")?.addEventListener("click",hideToast);
    $("thUpdateOverlay")?.addEventListener("click",event => {
      if (event.target.id === "thUpdateOverlay") closeModal();
    });

    $("thUpdateModal")?.addEventListener("pointermove",event => {
      const modal = $("thUpdateModal");
      if (!modal) return;
      const rect = modal.getBoundingClientRect();
      modal.style.setProperty("--mx",(event.clientX - rect.left) + "px");
      modal.style.setProperty("--my",(event.clientY - rect.top) + "px");
    },{passive:true});

    document.addEventListener("click", event => {
      const button = event.target.closest?.(".notification-btn");
      if (!button || !updateAvailable) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal();
    }, true);
    ensureBell();
  }

  function openChannel() {
    if (!("BroadcastChannel" in window)) return;
    try {
      channel = new BroadcastChannel("tubalhub_update");
      channel.addEventListener("message", event => {
        const data = event.data;
        if (data?.type === "website-update" && data.data) {
          showUpdate(normalize(data.data),"broadcast");
        } else if (data?.type === "website-update-seen" && data.version) {
          const current = localStorage.getItem(LAST_SEEN_KEY);
          if (current !== data.version) {
            localStorage.setItem(LAST_SEEN_KEY,data.version);
            localStorage.setItem(LEGACY_VERSION_KEY,data.version);
            if (currentData?.version === data.version) {
              setBellState(false);
              hideToast();
              closeModal();
            }
          }
        }
      });
    } catch (_) {}
  }

  function listenServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("controllerchange",() => poll());
    navigator.serviceWorker.ready.then(reg => {
      reg.addEventListener("updatefound",() => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange",() => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) poll();
        });
      });
    }).catch(() => {});
  }

  function hideAllUi() {
    setBellState(false);
    closeModal();
    hideToast();
    const badge=$("thVersionBadge");
    if (badge) badge.hidden=true;
  }

  function setUpdatesEnabled(enabled) {
    const on = enabled !== false;
    localStorage.setItem(UPDATES_ENABLED_KEY,on ? "1" : "0");
    if (on) {
      const badge=$("thVersionBadge");
      if (badge) badge.hidden=false;
      if (!pollTimer) pollTimer=setInterval(poll,POLL_MS);
      poll();
    } else {
      if (pollTimer) {clearInterval(pollTimer);pollTimer=null;}
      localStorage.removeItem(UPDATE_KEY);
      hideAllUi();
    }
    return on;
  }

  window.tubalHubUpdateNotifier = window.tubalHubUpdateNotifier || {};
  window.tubalHubUpdateNotifier.setEnabled = setUpdatesEnabled;
  window.tubalHubUpdateNotifier.isEnabled = updatesEnabled;
  window.tubalHubUpdateNotifier.open = openModal;
  window.tubalHubUpdateNotifier.markSeen = markSeenAndClose;

  async function init() {
    try {
      await loadUi();
      openChannel();
      listenServiceWorker();
      if (updatesEnabled()) {
        await poll();
        clearInterval(pollTimer);
        pollTimer=setInterval(poll,POLL_MS);
      } else {
        hideAllUi();
      }
    } catch (error) {
      console.warn("[TUBAL HUB update notifier]",error);
    }
  }

  init();
})();