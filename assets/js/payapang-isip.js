(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const storage = {
    grounding: "payapang-isip-grounding-v1",
    journal: "payapang-isip-journal-v1"
  };

  const state = {
    box: { running:false, phaseIndex:0, remaining:4, round:0, timer:null },
    diaphragm: { running:false, remaining:120, timer:null },
    weil: { running:false, phaseIndex:0, remaining:4, breath:0, timer:null },
    journal: { entries:[], editingId:null }
  };

  const boxPhases = [
    { name:"Inhale", seconds:4, klass:"inhale" },
    { name:"Hold", seconds:4, klass:"hold" },
    { name:"Exhale", seconds:4, klass:"exhale" },
    { name:"Hold", seconds:4, klass:"hold" }
  ];

  const weilPhases = [
    { name:"Inhale", seconds:4, klass:"inhale" },
    { name:"Hold", seconds:7, klass:"hold" },
    { name:"Exhale", seconds:8, klass:"exhale" }
  ];

  const els = {
    toast: $("#piToast"),

    boxVisual: $("#boxVisual"),
    boxPhase: $("#boxPhase"),
    boxCount: $("#boxCount"),
    boxRound: $("#boxRound"),
    boxProgress: $("#boxProgress"),
    boxStatus: $("#boxStatus"),
    boxStart: $("#boxStart"),

    diaphragmTimer: $("#diaphragmTimer"),
    diaphragmPhase: $("#diaphragmPhase"),
    diaphragmStatus: $("#diaphragmStatus"),
    diaphragmStart: $("#diaphragmStart"),

    weilVisual: $("#weilVisual"),
    weilPhase: $("#weilPhase"),
    weilCount: $("#weilCount"),
    weilRound: $("#weilRound"),
    weilProgress: $("#weilProgress"),
    weilStatus: $("#weilStatus"),
    weilStart: $("#weilStart"),

    groundingSave: $("#groundingSave"),
    groundingSaved: $("#groundingSaved"),

    journalMood: $("#journalMood"),
    journalInput: $("#journalInput"),
    journalSave: $("#journalSave"),
    journalCancel: $("#journalCancel"),
    journalMode: $("#journalMode"),
    journalEntries: $("#journalEntries")
  };

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("open");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("open"), 2200);
  }

  function safeRead(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      showToast("This browser could not save that entry.");
      return false;
    }
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "entry-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Saved";
    return d.toLocaleString("en-PH", {
      month:"short",
      day:"numeric",
      year:"numeric",
      hour:"numeric",
      minute:"2-digit"
    });
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return m + ":" + sec;
  }

  function setOrb(orb, phase) {
    if (!orb) return;
    orb.classList.remove("inhale", "hold", "exhale");
    if (phase) orb.classList.add(phase.klass);
  }

  // Fast, GPU-friendly cursor spotlight: one requestAnimationFrame per frame at most.
  let raf = 0;
  window.addEventListener("pointermove", (event) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      document.body.style.setProperty("--mx", event.clientX + "px");
      document.body.style.setProperty("--my", event.clientY + "px");
      raf = 0;
    });
  }, { passive:true });

  function applyTheme(theme) {
    const value = ["midnight", "forest", "light"].includes(theme) ? theme : "forest";
    document.body.classList.remove("theme-midnight", "theme-forest", "theme-light");
    document.body.classList.add("theme-" + value);
    $$(".pi-theme button").forEach(button => {
      button.classList.toggle("active", button.dataset.theme === value);
    });
  }

  function initThemes() {
    const stored = localStorage.getItem("tubalhub-theme") || "forest";
    applyTheme(stored);
    $$(".pi-theme button").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.theme;
        localStorage.setItem("tubalhub-theme", value);
        applyTheme(value);
        window.dispatchEvent(new CustomEvent("tubalhubthemechange", { detail:value }));
      });
    });
    window.addEventListener("tubalhubthemechange", () => {
      applyTheme(localStorage.getItem("tubalhub-theme") || "forest");
    });
  }

  function finishBox() {
    clearInterval(state.box.timer);
    state.box.timer = null;
    state.box.running = false;
    state.box.phaseIndex = 0;
    state.box.remaining = 4;
    state.box.round = 0;
    setOrb(els.boxVisual, null);
    els.boxPhase.textContent = "Done";
    els.boxCount.textContent = "✓";
    els.boxRound.textContent = "4 rounds complete";
    els.boxProgress.style.width = "100%";
    els.boxStatus.textContent = "Nice work. Let your breathing return to a comfortable pace.";
    els.boxStart.textContent = "Start 4 Rounds Again";
  }

  function renderBox() {
    const phase = boxPhases[state.box.phaseIndex];
    setOrb(els.boxVisual, phase);
    els.boxPhase.textContent = phase.name;
    els.boxCount.textContent = String(state.box.remaining);
    els.boxRound.textContent = "Round " + state.box.round + " / 4";
    const phaseProgress = 1 - (state.box.remaining / phase.seconds);
    const overall = ((state.box.round - 1) * 4 + state.box.phaseIndex + phaseProgress) / 16;
    els.boxProgress.style.width = (Math.max(0, Math.min(1, overall)) * 100).toFixed(1) + "%";
    els.boxStatus.textContent = phase.name + " • " + state.box.remaining + " seconds";
  }

  function tickBox() {
    if (!state.box.running) return;
    state.box.remaining -= 1;
    if (state.box.remaining > 0) {
      renderBox();
      return;
    }

    if (state.box.phaseIndex === boxPhases.length - 1) {
      if (state.box.round >= 4) {
        finishBox();
        return;
      }
      state.box.round += 1;
      state.box.phaseIndex = 0;
    } else {
      state.box.phaseIndex += 1;
    }
    state.box.remaining = boxPhases[state.box.phaseIndex].seconds;
    renderBox();
  }

  function startBox() {
    if (state.box.running) {
      clearInterval(state.box.timer);
      state.box.running = false;
      els.boxStart.textContent = "Start 4 Rounds";
      els.boxStatus.textContent = "Stopped. Your progress was reset.";
      state.box.round = 0;
      state.box.phaseIndex = 0;
      state.box.remaining = 4;
      setOrb(els.boxVisual, null);
      els.boxPhase.textContent = "Ready";
      els.boxCount.textContent = "4";
      els.boxRound.textContent = "Round 0 / 4";
      els.boxProgress.style.width = "0%";
      return;
    }
    state.box.running = true;
    state.box.round = 1;
    state.box.phaseIndex = 0;
    state.box.remaining = boxPhases[0].seconds;
    els.boxStart.textContent = "Stop";
    renderBox();
    clearInterval(state.box.timer);
    state.box.timer = setInterval(tickBox, 1000);
  }

  function finishDiaphragm() {
    clearInterval(state.diaphragm.timer);
    state.diaphragm.timer = null;
    state.diaphragm.running = false;
    state.diaphragm.remaining = 120;
    els.diaphragmTimer.textContent = "02:00";
    els.diaphragmPhase.textContent = "Done";
    els.diaphragmStatus.textContent = "Two minutes complete. Notice how your chest, belly, and breathing feel now.";
    els.diaphragmStart.textContent = "Start 2 Minutes Again";
  }

  function startDiaphragm() {
    if (state.diaphragm.running) {
      clearInterval(state.diaphragm.timer);
      state.diaphragm.running = false;
      state.diaphragm.remaining = 120;
      els.diaphragmTimer.textContent = "02:00";
      els.diaphragmPhase.textContent = "Ready";
      els.diaphragmStatus.textContent = "Stopped. Restart when you are comfortable.";
      els.diaphragmStart.textContent = "Start 2 Minutes";
      return;
    }

    state.diaphragm.running = true;
    state.diaphragm.remaining = 120;
    els.diaphragmStart.textContent = "Stop";
    els.diaphragmPhase.textContent = "Slow belly breathing";
    els.diaphragmStatus.textContent = "Try about 5–6 breaths per minute. Keep the breath gentle.";
    clearInterval(state.diaphragm.timer);
    state.diaphragm.timer = setInterval(() => {
      state.diaphragm.remaining -= 1;
      els.diaphragmTimer.textContent = formatClock(state.diaphragm.remaining);
      if (state.diaphragm.remaining <= 0) finishDiaphragm();
    }, 1000);
  }

  function finishWeil() {
    clearInterval(state.weil.timer);
    state.weil.timer = null;
    state.weil.running = false;
    state.weil.phaseIndex = 0;
    state.weil.remaining = 4;
    state.weil.breath = 0;
    setOrb(els.weilVisual, null);
    els.weilPhase.textContent = "Done";
    els.weilCount.textContent = "✓";
    els.weilRound.textContent = "4 breaths complete";
    els.weilProgress.style.width = "100%";
    els.weilStatus.textContent = "Done. Breathe normally and let the exercise settle.";
    els.weilStart.textContent = "Start 4 Breaths Again";
  }

  function renderWeil() {
    const phase = weilPhases[state.weil.phaseIndex];
    setOrb(els.weilVisual, phase);
    els.weilPhase.textContent = phase.name;
    els.weilCount.textContent = String(state.weil.remaining);
    els.weilRound.textContent = "Breath " + state.weil.breath + " / 4";
    const cycleSeconds = 4 + 7 + 8;
    const elapsedInPhase = phase.seconds - state.weil.remaining;
    const cycleProgress = (weilPhases.slice(0, state.weil.phaseIndex).reduce((sum, item) => sum + item.seconds, 0) + elapsedInPhase) / cycleSeconds;
    const overall = ((state.weil.breath - 1) + cycleProgress) / 4;
    els.weilProgress.style.width = (Math.max(0, Math.min(1, overall)) * 100).toFixed(1) + "%";
    els.weilStatus.textContent = phase.name + " • " + state.weil.remaining + " seconds";
  }

  function tickWeil() {
    if (!state.weil.running) return;
    state.weil.remaining -= 1;
    if (state.weil.remaining > 0) {
      renderWeil();
      return;
    }

    if (state.weil.phaseIndex === weilPhases.length - 1) {
      if (state.weil.breath >= 4) {
        finishWeil();
        return;
      }
      state.weil.breath += 1;
      state.weil.phaseIndex = 0;
    } else {
      state.weil.phaseIndex += 1;
    }
    state.weil.remaining = weilPhases[state.weil.phaseIndex].seconds;
    renderWeil();
  }

  function startWeil() {
    if (state.weil.running) {
      clearInterval(state.weil.timer);
      state.weil.running = false;
      els.weilStart.textContent = "Start 4 Breaths";
      els.weilStatus.textContent = "Stopped. Restart when the pace feels comfortable.";
      state.weil.breath = 0;
      state.weil.phaseIndex = 0;
      state.weil.remaining = 4;
      setOrb(els.weilVisual, null);
      els.weilPhase.textContent = "Ready";
      els.weilCount.textContent = "4";
      els.weilRound.textContent = "Breath 0 / 4";
      els.weilProgress.style.width = "0%";
      return;
    }
    state.weil.running = true;
    state.weil.breath = 1;
    state.weil.phaseIndex = 0;
    state.weil.remaining = weilPhases[0].seconds;
    els.weilStart.textContent = "Stop";
    renderWeil();
    clearInterval(state.weil.timer);
    state.weil.timer = setInterval(tickWeil, 1000);
  }

  function renderGrounding() {
    const sessions = safeRead(storage.grounding, []);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      els.groundingSaved.innerHTML = '<div class="saved-empty">Your saved grounding notes will appear here after you save your first session.</div>';
      return;
    }
    els.groundingSaved.innerHTML = sessions.slice(0, 8).map(session => {
      const labels = ["see","touch","hear","smell","taste"];
      return '<article class="grounding-session">' +
        '<div class="saved-meta"><strong>5–4–3–2–1 session</strong><span class="saved-time">' + formatDate(session.createdAt) + '</span></div>' +
        '<div class="grounding-values">' +
        session.values.map((value, index) => '<div><strong>' + (5-index) + ' ' + labels[index] + '</strong><span>' + escapeHtml(value || "—") + '</span></div>').join("") +
        '</div></article>';
    }).join("");
  }

  function saveGrounding() {
    const values = $$("[data-grounding]").map(input => input.value.trim());
    const session = { id:uid(), createdAt:new Date().toISOString(), values };
    const sessions = safeRead(storage.grounding, []);
    const list = Array.isArray(sessions) ? sessions : [];
    list.unshift(session);
    if (safeWrite(storage.grounding, list.slice(0, 20))) {
      renderGrounding();
      showToast("Grounding session saved in this browser.");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[char]));
  }

  function loadJournal() {
    const entries = safeRead(storage.journal, []);
    state.journal.entries = Array.isArray(entries) ? entries : [];
  }

  function renderJournal() {
    if (!state.journal.entries.length) {
      els.journalEntries.innerHTML = '<div class="saved-empty">No journal entries yet. Your first saved entry will appear here.</div>';
      return;
    }
    els.journalEntries.innerHTML = state.journal.entries.map(entry =>
      '<article class="journal-entry" data-entry="' + escapeHtml(entry.id) + '">' +
        '<div class="journal-meta">' +
          '<div><span class="mood">' + (entry.mood ? escapeHtml(entry.mood) : "•") + '</span><span class="journal-time"> ' + formatDate(entry.createdAt) + '</span></div>' +
          '<div class="entry-tools"><button type="button" data-edit="' + escapeHtml(entry.id) + '" aria-label="Edit entry">✎</button><button type="button" data-delete="' + escapeHtml(entry.id) + '" aria-label="Delete entry">×</button></div>' +
        '</div>' +
        '<div class="journal-text">' + escapeHtml(entry.text) + '</div>' +
      '</article>'
    ).join("");
  }

  function resetJournalEditor() {
    state.journal.editingId = null;
    els.journalInput.value = "";
    els.journalMood.value = "";
    els.journalMode.textContent = "New entry";
    els.journalSave.textContent = "Save Entry";
    els.journalCancel.hidden = true;
  }

  function saveJournal() {
    const text = els.journalInput.value.trim();
    const mood = els.journalMood.value;
    if (!text) {
      showToast("Write your journal entry first.");
      els.journalInput.focus();
      return;
    }

    if (state.journal.editingId) {
      const entry = state.journal.entries.find(item => item.id === state.journal.editingId);
      if (!entry) return;
      entry.text = text;
      entry.mood = mood;
      entry.createdAt = new Date().toISOString();
      showToast("Journal entry updated.");
    } else {
      state.journal.entries.unshift({
        id:uid(),
        createdAt:new Date().toISOString(),
        mood,
        text
      });
      showToast("Journal entry saved.");
    }

    state.journal.entries = state.journal.entries.slice(0, 50);
    safeWrite(storage.journal, state.journal.entries);
    resetJournalEditor();
    renderJournal();
  }

  function editJournal(id) {
    const entry = state.journal.entries.find(item => item.id === id);
    if (!entry) return;
    state.journal.editingId = id;
    els.journalInput.value = entry.text;
    els.journalMood.value = entry.mood || "";
    els.journalMode.textContent = "Editing entry";
    els.journalSave.textContent = "Update Entry";
    els.journalCancel.hidden = false;
    els.journalInput.focus();
    els.journalInput.scrollIntoView({ behavior:"smooth", block:"center" });
  }

  function deleteJournal(id) {
    const entry = state.journal.entries.find(item => item.id === id);
    if (!entry) return;
    if (!window.confirm("Delete this journal entry?")) return;
    state.journal.entries = state.journal.entries.filter(item => item.id !== id);
    safeWrite(storage.journal, state.journal.entries);
    if (state.journal.editingId === id) resetJournalEditor();
    renderJournal();
    showToast("Journal entry deleted.");
  }

  function bind() {
    els.boxStart.addEventListener("click", startBox);
    els.diaphragmStart.addEventListener("click", startDiaphragm);
    els.weilStart.addEventListener("click", startWeil);
    els.groundingSave.addEventListener("click", saveGrounding);

    els.journalSave.addEventListener("click", saveJournal);
    els.journalCancel.addEventListener("click", resetJournalEditor);

    els.journalEntries.addEventListener("click", event => {
      const edit = event.target.closest("[data-edit]");
      const del = event.target.closest("[data-delete]");
      if (edit) editJournal(edit.dataset.edit);
      if (del) deleteJournal(del.dataset.delete);
    });
  }

  function init() {
    initThemes();
    renderGrounding();
    loadJournal();
    renderJournal();
    bind();
  }

  init();
})();