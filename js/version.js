(() => {
  if (window.__tubalHubHardVersionLoaded) return;
  window.__tubalHubHardVersionLoaded = true;

  const VERSION_URL = new URL("version.json", document.baseURI).href;
  const VERSION_KEY = "tubalhub_version_real";
  const NOTIFIED_KEY = "tubalhub_notified_version_real";
  const PENDING_KEY = "tubalhub_update_pending_real";
  const LAST_CHECK_KEY = "tubalhub_version_real_last_check";
  const CHECK_MS = 30000;
  let timer = null;
  let started = false;
  let checking = false;

  const $ = id => document.getElementById(id);

  function setBannerVisible(visible) {
    const banner = $("updateNotification");
    if (!banner) return;
    banner.style.transform = visible
      ? "translateX(-50%) translateY(0)"
      : "translateX(-50%) translateY(150%)";
  }

  function showUpdateNotificationReal(oldVer, newVer) {
    const banner = $("updateNotification");
    if (!banner) return;
    const title = $("updateTitle");
    const version = $("updateVersionNew");
    if (version) version.textContent = "v" + newVer;
    if (title) title.textContent = oldVer === "0.0.0"
      ? "Welcome to v" + newVer
      : "May bagong update! v" + oldVer + " → v" + newVer;
    setBannerVisible(true);
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      oldVer: oldVer || "0.0.0",
      newVer,
      time: Date.now()
    }));
    try { if (navigator.vibrate) navigator.vibrate([200,100,200]); } catch (_) {}
  }

  async function checkVersionReal(forceNotify = false) {
    if (checking) return;
    checking = true;
    try {
      const res = await fetch(VERSION_URL + (VERSION_URL.includes("?") ? "&" : "?") + "t=" + Date.now(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
      });
      if (!res.ok) throw new Error("version.json " + res.status);
      const data = await res.json();
      const remoteVersionReal = String(data.version || data.build || data.v || "").trim();
      if (!remoteVersionReal) throw new Error("version.json has no version");

      const stored = localStorage.getItem(VERSION_KEY) || "";
      const notified = localStorage.getItem(NOTIFIED_KEY) || "";
      const isNewer = !!stored && stored !== remoteVersionReal;
      const isFirstTime = !stored;

      if ((isNewer || isFirstTime || forceNotify) && (notified !== remoteVersionReal || forceNotify)) {
        showUpdateNotificationReal(stored || "0.0.0", remoteVersionReal);
        localStorage.setItem(NOTIFIED_KEY, remoteVersionReal);
      }

      // Do not mark a new version as fully updated here. Update Now does that.
      if (stored === remoteVersionReal) {
        localStorage.setItem(VERSION_KEY, remoteVersionReal);
      }
      localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());

      const liveVersion = $("liveVersion");
      if (liveVersion) liveVersion.textContent = "v" + remoteVersionReal;
      const homeVersion = $("homeVersion");
      if (homeVersion) homeVersion.textContent = "v" + remoteVersionReal;
      return remoteVersionReal;
    } catch (error) {
      console.warn("[TUBAL HUB hard version check]", error);
      setTimeout(() => checkVersionReal(true), 10000);
    } finally {
      checking = false;
    }
  }

  async function forceReloadUpdate() {
    const version = $("updateVersionNew")?.textContent?.replace(/^v/i, "").trim();
    if (version) localStorage.setItem(VERSION_KEY, version);
    localStorage.removeItem(PENDING_KEY);
    localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } catch (_) {}

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.unregister()));
      }
    } catch (_) {}

    const url = new URL(location.href);
    url.searchParams.set("update", Date.now().toString());
    location.replace(url.href);
  }

  function bind() {
    $("updateNowBtn")?.addEventListener("click", forceReloadUpdate);
    $("updateCloseBtn")?.addEventListener("click", () => {
      // Closing is temporary. Pending state intentionally remains.
      setBannerVisible(false);
    });

    window.addEventListener("focus", () => checkVersionReal(false), { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkVersionReal(false);
    });
    window.addEventListener("online", () => checkVersionReal(true));
    document.addEventListener("click", () => {
      const last = localStorage.getItem(LAST_CHECK_KEY);
      const age = last ? Date.now() - new Date(last).getTime() : Infinity;
      if (!last || !Number.isFinite(age) || age > 60000) checkVersionReal(false);
    }, { passive: true });

    window.addEventListener("load", () => {
      const pending = localStorage.getItem(PENDING_KEY);
      if (pending) {
        try {
          const p = JSON.parse(pending);
          if (p?.newVer && Date.now() - Number(p.time || 0) < 3600000) {
            setTimeout(() => showUpdateNotificationReal(p.oldVer || "0.0.0", p.newVer), 1500);
          }
        } catch (_) {}
      }
      checkVersionReal(true);
    }, { once: true });
  }

  function start() {
    if (started) return;
    started = true;
    bind();
    // Immediate check even before window load.
    checkVersionReal(true);
    timer = setInterval(() => checkVersionReal(false), CHECK_MS);
  }

  window.tubalHubVersionChecker = { start, check: checkVersionReal, show: showUpdateNotificationReal };
  start();
})();
