/* TUBAL HUB — Featured Games bridge
   One real source: /data/games.json (CTRLZONE catalog)
*/
(() => {
  const SOURCE = new URL("data/games.json", document.baseURI).href;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  async function loadCatalog() {
    try {
      const res = await fetch(SOURCE + "?homeGames=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("games.json " + res.status);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.games) ? data.games : []);
      return rows.filter(g => g && g.id && (g.title || g.name)).map(g => ({
        ...g,
        title: String(g.title || g.name),
        genre: String(g.genre || g.category || "Game"),
        category: String(g.category || g.genre || "Game"),
        description: String(g.description || ""),
        emoji: String(g.emoji || "🎮"),
        logo: String(g.logo || ""),
        officialUrl: String(g.officialUrl || "")
      }));
    } catch (err) {
      console.warn("[TUBAL HUB Featured Games] catalog load failed", err);
      try {
        const local = JSON.parse(localStorage.getItem("tubalhub_ctrlzone_games") || "[]");
        return Array.isArray(local) ? local.filter(g => g?.id && (g.title || g.name)).map(g => ({
          ...g,
          title: String(g.title || g.name),
          genre: String(g.genre || g.category || "Game"),
          category: String(g.category || g.genre || "Game"),
          description: String(g.description || ""),
          emoji: String(g.emoji || "🎮"),
          logo: String(g.logo || "")
        })) : [];
      } catch (_) {
        return [];
      }
    }
  }

  function playCount(id) {
    const n = Number(localStorage.getItem("play_" + id + "_real") || 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function render(games) {
    const box = document.getElementById("bentoGamesGrid");
    if (!box) return false;

    const count = document.getElementById("bentoGamesLiveCount");
    if (count) count.textContent = games.length + " " + (games.length === 1 ? "game" : "games");

    if (!games.length) {
      box.innerHTML =
        '<div class="real-bento-empty"><div class="empty-icon">🎮</div>' +
        '<p>No games are currently listed in the real CTRLZONE catalog.</p>' +
        '<small>Real data source: /data/games.json</small>' +
        '<a class="real-quick-link" href="pages/ctrlzone.html">Open CTRLZONE →</a></div>';
      return true;
    }

    box.innerHTML = games.slice(0, 4).map((g, i) => {
      const colorA = g.colorA || "#283247";
      const colorB = g.colorB || "#0d1220";
      const official = g.officialUrl
        ? '<a class="bento-game-official" href="' + esc(g.officialUrl) + '" target="_blank" rel="noopener noreferrer">Official site ↗</a>'
        : "";
      return '<article class="bento-game-card premium-game-card" style="--game-a:' + esc(colorA) + ';--game-b:' + esc(colorB) + '">' +
        '<div class="bento-game-cover premium-game-cover">' +
          '<div class="bento-game-cover-top"><span class="bento-game-rank">0' + (i + 1) + '</span><span class="bento-game-category">' + esc(g.category) + '</span></div>' +
          '<div class="bento-game-emblem">' +
            (g.logo ? '<img class="bento-game-logo" src="' + esc(g.logo) + '" alt="' + esc(g.title) + ' official logo" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' : '') +
            '<span' + (g.logo ? ' hidden' : '') + '>' + esc(g.emoji) + '</span></div>' +
          '<div class="bento-game-cover-shine" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="bento-game-body premium-game-body">' +
          '<div class="bento-game-title-row"><div><span class="bento-game-genre">' + esc(g.genre) + '</span><h3 class="bento-game-title">' + esc(g.title) + '</h3></div><span class="bento-game-local">REAL</span></div>' +
          '<p class="bento-game-description">' + esc(g.description) + '</p>' +
          '<div class="bento-game-footer-row"><span class="bento-game-plays">▶ ' + playCount(g.id) + ' local plays</span><a class="bento-play-btn" href="pages/ctrlzone.html?game=' + encodeURIComponent(g.id) + '">Play Now <span>→</span></a></div>' +
          official +
        '</div>' +
      '</article>';
    }).join("");
    return true;
  }

  let catalogGames = [];
  let rotationTimer = null;
  let rotationIndex = 0;

  function renderRotating() {
    if (!catalogGames.length) return;
    const ordered = catalogGames.map((_, i) => catalogGames[(rotationIndex + i) % catalogGames.length]);
    render(ordered);
  }

  async function refresh() {
    const games = await loadCatalog();
    catalogGames = games;
    rotationIndex = catalogGames.length ? rotationIndex % catalogGames.length : 0;
    renderRotating();
  }

  function startRotation() {
    clearInterval(rotationTimer);
    if (catalogGames.length <= 4) return;
    rotationTimer = setInterval(() => {
      rotationIndex = (rotationIndex + 1) % catalogGames.length;
      renderRotating();
    }, 4500);
  }

  function init() {
    refresh().then(startRotation);
    // Home can be initialized by several scripts; retry after layout/script startup.
    [250, 800, 1600, 3000].forEach(ms => setTimeout(() => {
      refresh().then(startRotation);
    }, ms));
    window.addEventListener("focus", refresh, { passive: true });
    window.addEventListener("storage", e => {
      if (e.key === "tubalhub_ctrlzone_games" || (e.key || "").startsWith("play_")) refresh();
    });
    window.addEventListener("tubalhub-real-data-update", refresh);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
