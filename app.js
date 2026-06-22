const STORAGE_KEY = "french-flashcards-v1";
const CLOUD_SETTINGS_KEY = "french-flashcards-cloud-settings-v1";
const SEED_DECK_URL = "data/seed-cards.json";
const SEED_DECK_VERSION = 3;
const PROGRESS_USER = "david";
const GITHUB_REPO_OWNER = "david-eskoundos";
const GITHUB_REPO_NAME = "FrenchFlashCards";
const GITHUB_REPO_BRANCH = "main";
const PROGRESS_FILE_PATH = `progress/${PROGRESS_USER}-progress.json`;
const BROWSE_PAGE_SIZE = 25;
const REPO_SAVE_MAX_ATTEMPTS = 3;

function toIso(date) {
  return new Date(date).toISOString();
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createCard(input, now = new Date()) {
  const front = normalizeText(input.front);
  const back = normalizeText(input.back);

  if (!front) throw new Error("Front is required");
  if (!back) throw new Error("Back is required");

  return {
    id: input.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    front,
    back,
    notes: normalizeText(input.notes),
    tags: normalizeText(input.tags),
    direction: input.direction || "fr-en",
    createdAt: input.createdAt || toIso(now),
    updatedAt: input.updatedAt || toIso(now),
    dueAt: input.dueAt || toIso(now),
    intervalDays: Number(input.intervalDays || 0),
    ease: Number(input.ease || 2.5),
    repetitions: Number(input.repetitions || 0),
    lapses: Number(input.lapses || 0)
  };
}

function scheduleCard(card, rating, now = new Date()) {
  const next = { ...card, updatedAt: toIso(now) };
  const easeDelta = { again: -0.2, hard: -0.05, good: 0, easy: 0.15 }[rating];
  if (easeDelta === undefined) throw new Error("Unknown rating");

  next.ease = Math.max(1.3, Number((next.ease + easeDelta).toFixed(2)));

  if (rating === "again") {
    next.repetitions = 0;
    next.lapses += 1;
    next.intervalDays = 0;
    next.dueAt = toIso(addMinutes(now, 10));
    return next;
  }

  next.repetitions += 1;

  if (rating === "hard") {
    next.intervalDays = Math.max(1, Math.ceil((next.intervalDays || 0.5) * 1.2));
  } else if (next.repetitions === 1) {
    next.intervalDays = rating === "easy" ? 2 : 1;
  } else if (next.repetitions === 2) {
    next.intervalDays = rating === "easy" ? 4 : 3;
  } else {
    const multiplier = rating === "easy" ? next.ease + 0.4 : next.ease;
    next.intervalDays = Math.max(1, Math.round(next.intervalDays * multiplier));
  }

  next.dueAt = toIso(addDays(now, next.intervalDays));
  return next;
}

function hasBeenStudied(card) {
  return card.repetitions > 0 || card.lapses > 0;
}

function getStudyQueue(cards, now = new Date()) {
  const nowTime = new Date(now).getTime();
  const due = cards
    .filter((card) => hasBeenStudied(card) && new Date(card.dueAt).getTime() <= nowTime)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const fresh = cards.filter((card) => card.repetitions === 0 && card.lapses === 0);
  return [...due, ...fresh];
}

function parseImportedDeck(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON");
  }

  const rawCards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(rawCards)) throw new Error("Import must include a cards array");
  return rawCards.map((card) => createCard(card));
}

function mergeCards(existingCards, incomingCards) {
  const existingIds = new Set(existingCards.map((card) => card.id));
  const additions = incomingCards.filter((card) => !existingIds.has(card.id));
  return [...existingCards, ...additions];
}


function syncSeedCards(existingCards, seedCards) {
  const seedById = new Map(seedCards.map((card) => [card.id, card]));
  const existingIds = new Set(existingCards.map((card) => card.id));
  const syncedExisting = existingCards.map((card) => {
    const seed = seedById.get(card.id);
    if (!seed) return card;
    return {
      ...card,
      front: seed.front,
      back: seed.back,
      notes: seed.notes,
      tags: seed.tags,
      direction: seed.direction,
      source: seed.source
    };
  });
  const additions = seedCards.filter((card) => !existingIds.has(card.id));
  return [...syncedExisting, ...additions];
}
function resetLearning(cards, now = new Date()) {
  return cards.map((card) => ({
    ...card,
    updatedAt: toIso(now),
    dueAt: toIso(now),
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0
  }));
}

function getLearningStats(cards) {
  const total = cards.length;
  const studied = cards.filter(hasBeenStudied).length;
  const learnedPercent = total ? Math.round((studied / total) * 100) : 0;
  return { total, studied, learnedPercent };
}

function createCloudPayload(cards, seedDeckVersion, now = new Date()) {
  return {
    app: "FrenchFlashCards",
    version: 2,
    user: PROGRESS_USER,
    progressPath: PROGRESS_FILE_PATH,
    seedDeckVersion,
    savedAt: toIso(now),
    stats: getLearningStats(cards),
    cards
  };
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(text) {
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function createRepoSaveBody(content, sha = "") {
  const body = {
    message: `chore: update ${PROGRESS_USER} learning progress`,
    content: encodeBase64(content),
    branch: GITHUB_REPO_BRANCH
  };
  if (sha) body.sha = sha;
  return body;
}

function shouldRetryRepoSave(status) {
  return status === 409;
}

function getFrenchText(card) {
  return card.direction === "en-fr" ? card.back : card.front;
}

function buildSpellingText(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[\u2019']/g, " apostrophe ")
    .replace(/-/g, " tiret ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word === "apostrophe" || word === "tiret" ? word : Array.from(word).join(" ")))
    .join(". ")
    .replace(/\. apostrophe\./g, " apostrophe")
    .replace(/\. tiret\./g, " tiret");
}
function readStoredDeck() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { cards: [], seedDeckVersion: 0 };
    const parsed = JSON.parse(stored);
    return {
      cards: parseImportedDeck(stored),
      seedDeckVersion: Number(parsed.seedDeckVersion || 0)
    };
  } catch {
    return { cards: [], seedDeckVersion: 0 };
  }
}

function startBrowserApp() {
  const els = {
    dueCount: document.getElementById("dueCount"),
    newCount: document.getElementById("newCount"),
    learnedPercent: document.getElementById("learnedPercent"),
    cardPosition: document.getElementById("cardPosition"),
    cardTags: document.getElementById("cardTags"),
    flashcard: document.getElementById("flashcard"),
    cardPrompt: document.getElementById("cardPrompt"),
    cardAnswer: document.getElementById("cardAnswer"),
    cardNotes: document.getElementById("cardNotes"),
    revealBtn: document.getElementById("revealBtn"),
    ratingGrid: document.getElementById("ratingGrid"),
    cardForm: document.getElementById("cardForm"),
    front: document.getElementById("front"),
    back: document.getElementById("back"),
    notes: document.getElementById("notes"),
    tags: document.getElementById("tags"),
    direction: document.getElementById("direction"),
    search: document.getElementById("search"),
    browseCount: document.getElementById("browseCount"),
    showMoreCardsBtn: document.getElementById("showMoreCardsBtn"),
    cardList: document.getElementById("cardList"),
    exportBtn: document.getElementById("exportBtn"),
    importText: document.getElementById("importText"),
    importBtn: document.getElementById("importBtn"),
    listenBtn: document.getElementById("listenBtn"),
    spellBtn: document.getElementById("spellBtn"),
    spellingLine: document.getElementById("spellingLine"),
    githubToken: document.getElementById("githubToken"),
    progressPath: document.getElementById("progressPath"),
    autoSync: document.getElementById("autoSync"),
    saveSyncBtn: document.getElementById("saveSyncBtn"),
    syncNowBtn: document.getElementById("syncNowBtn"),
    loadCloudBtn: document.getElementById("loadCloudBtn"),
    resetLearningBtn: document.getElementById("resetLearningBtn"),
    message: document.getElementById("message")
  };

  const storedDeck = readStoredDeck();
  const state = {
    cards: storedDeck.cards,
    seedDeckVersion: storedDeck.seedDeckVersion,
    cloud: readCloudSettings(),
    queue: [],
    currentIndex: 0,
    revealed: false,
    browseVisibleCount: BROWSE_PAGE_SIZE,
    cloudSaveTimer: null,
    cloudSaveInFlight: false,
    cloudSavePending: false
  };

  function setMessage(text) {
    els.message.textContent = text;
  }

  function readCloudSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CLOUD_SETTINGS_KEY) || "{}");
      return {
        token: normalizeText(parsed.token),
        autoSync: Boolean(parsed.autoSync)
      };
    } catch {
      return { token: "", autoSync: false };
    }
  }

  function saveCloudSettings() {
    localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(state.cloud));
    els.githubToken.value = state.cloud.token;
    els.progressPath.textContent = PROGRESS_FILE_PATH;
    els.autoSync.checked = state.cloud.autoSync;
  }

  function saveCards(options = {}) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, seedDeckVersion: state.seedDeckVersion, cards: state.cards })
      );
      if (options.cloud !== false) queueCloudSave();
    } catch {
      setMessage("Storage failed. Export your cards before closing this browser.");
    }
  }

  async function loadSeedCards() {
    if (state.seedDeckVersion >= SEED_DECK_VERSION) return;

    try {
      const response = await fetch(SEED_DECK_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Seed deck unavailable");
      const text = await response.text();
      const seedCards = parseImportedDeck(text);
      const before = state.cards.length;
      state.cards = syncSeedCards(state.cards, seedCards);
      state.seedDeckVersion = SEED_DECK_VERSION;
      saveCards({ cloud: false });
      renderAll();
      const added = state.cards.length - before;
      if (added > 0) setMessage(`Loaded ${added} built-in cards.`);
    } catch {
      setMessage("Built-in cards could not be loaded. You can still add your own cards.");
    }
  }

  function refreshQueue() {
    state.queue = getStudyQueue(state.cards);
    state.currentIndex = Math.min(state.currentIndex, Math.max(state.queue.length - 1, 0));
    state.revealed = false;
  }

  function currentCard() {
    return state.queue[state.currentIndex];
  }

  function renderStats() {
    const now = Date.now();
    const due = state.cards.filter((card) => hasBeenStudied(card) && new Date(card.dueAt).getTime() <= now).length;
    const fresh = state.cards.filter((card) => card.repetitions === 0 && card.lapses === 0).length;
    els.dueCount.textContent = String(due);
    els.newCount.textContent = String(fresh);
    els.learnedPercent.textContent = `${getLearningStats(state.cards).learnedPercent}%`;
  }

  function renderStudy() {
    refreshQueue();
    renderStats();
    const card = currentCard();

    els.ratingGrid.hidden = true;
    els.cardAnswer.hidden = true;
    els.revealBtn.hidden = false;

    if (!card) {
      els.cardPosition.textContent = state.cards.length ? "All caught up" : "No cards";
      els.cardTags.textContent = "";
      els.cardPrompt.textContent = state.cards.length
        ? "No cards are due right now."
        : "Loading built-in cards...";
      els.cardAnswer.textContent = "";
      els.cardNotes.textContent = state.cards.length ? "Come back later or add a new card." : "";
      els.revealBtn.disabled = true;
      return;
    }

    els.revealBtn.disabled = false;
    els.cardPosition.textContent = `${state.currentIndex + 1} of ${state.queue.length}`;
    els.cardTags.textContent = card.tags;
    els.cardPrompt.textContent = card.front;
    els.cardAnswer.textContent = card.back;
    els.cardNotes.textContent = card.notes;
  }

  function renderBrowse() {
    const query = normalizeText(els.search.value).toLowerCase();
    const cards = state.cards.filter((card) => {
      const haystack = `${card.front} ${card.back} ${card.notes} ${card.tags}`.toLowerCase();
      return haystack.includes(query);
    });
    const visibleCards = cards.slice(0, state.browseVisibleCount);

    els.cardList.innerHTML = "";
    els.browseCount.textContent = `${visibleCards.length} of ${cards.length} cards shown`;
    els.showMoreCardsBtn.hidden = visibleCards.length >= cards.length;
    els.showMoreCardsBtn.textContent = `Show ${Math.min(BROWSE_PAGE_SIZE, cards.length - visibleCards.length)} more`;

    if (!cards.length) {
      const empty = document.createElement("p");
      empty.textContent = "No cards found.";
      els.cardList.append(empty);
      return;
    }

    for (const card of visibleCards) {
      const item = document.createElement("article");
      item.className = "list-item";

      const front = document.createElement("strong");
      front.textContent = card.front;
      const back = document.createElement("span");
      back.textContent = card.back;
      const meta = document.createElement("span");
      const status = hasBeenStudied(card) ? `due ${new Date(card.dueAt).toLocaleDateString()}` : "new card";
      meta.textContent = `${card.tags || "untagged"} - ${status}`;

      const actions = document.createElement("div");
      actions.className = "list-actions";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (!confirm("Delete this card?")) return;
        state.cards = state.cards.filter((candidate) => candidate.id !== card.id);
        saveCards();
        renderAll();
        setMessage("Card deleted.");
      });
      actions.append(deleteBtn);

      item.append(front, back, meta, actions);
      els.cardList.append(item);
    }
  }

  function renderAll() {
    renderStudy();
    renderBrowse();
  }

  function revealCurrent() {
    const card = currentCard();
    if (!card) return;
    state.revealed = true;
    els.cardAnswer.hidden = false;
    els.revealBtn.hidden = true;
    els.ratingGrid.hidden = false;
  }

  function speakFrenchText(text, options = {}) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setMessage("Voice reading is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = options.rate || 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function speakCurrentFrench() {
    const card = currentCard();
    if (!card) return;
    const french = getFrenchText(card);
    els.spellingLine.textContent = french;
    speakFrenchText(french, { rate: 0.88 });
  }

  function spellCurrentFrench() {
    const card = currentCard();
    if (!card) return;
    const spelling = buildSpellingText(getFrenchText(card));
    els.spellingLine.textContent = `Spelling: ${spelling}`;
    speakFrenchText(spelling, { rate: 0.65 });
  }

  function cloudHeaders() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.cloud.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function progressFileUrl() {
    return `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${PROGRESS_FILE_PATH}`;
  }

  async function fetchProgressFileSha() {
    const response = await fetch(`${progressFileUrl()}?ref=${GITHUB_REPO_BRANCH}`, {
      headers: { ...cloudHeaders(), "Cache-Control": "no-cache" }
    });
    if (response.status === 404) return "";
    if (!response.ok) throw new Error(`GitHub progress lookup failed (${response.status})`);
    const file = await response.json();
    return file.sha || "";
  }

  async function saveToGithub(options = {}) {
    if (!state.cloud.token) {
      if (!options.silent) setMessage("Add a GitHub token before syncing.");
      return false;
    }

    if (state.cloudSaveInFlight) {
      state.cloudSavePending = true;
      return false;
    }

    state.cloudSaveInFlight = true;
    const payload = createCloudPayload(state.cards, state.seedDeckVersion);
    const content = JSON.stringify(payload, null, 2);

    try {
      let lastStatus = 0;
      for (let attempt = 1; attempt <= REPO_SAVE_MAX_ATTEMPTS; attempt += 1) {
        const sha = await fetchProgressFileSha();
        const response = await fetch(progressFileUrl(), {
          method: "PUT",
          headers: cloudHeaders(),
          body: JSON.stringify(createRepoSaveBody(content, sha))
        });

        if (response.ok) {
          if (!options.silent) setMessage(`Learning saved to ${PROGRESS_FILE_PATH}.`);
          return true;
        }

        lastStatus = response.status;
        if (!shouldRetryRepoSave(response.status)) break;
      }

      throw new Error(`GitHub repo save failed (${lastStatus})`);
    } catch (error) {
      if (!options.silent) setMessage(error.message || "GitHub repo save failed.");
      return false;
    } finally {
      state.cloudSaveInFlight = false;
      if (state.cloudSavePending) {
        state.cloudSavePending = false;
        queueCloudSave();
      }
    }
  }

  function queueCloudSave() {
    if (!state.cloud.autoSync || !state.cloud.token) return;
    window.clearTimeout(state.cloudSaveTimer);
    state.cloudSaveTimer = window.setTimeout(() => {
      saveToGithub({ silent: true });
    }, 3000);
  }

  async function loadFromGithub() {
    if (!state.cloud.token) {
      setMessage("Add a GitHub token before loading repo progress.");
      return;
    }

    try {
      const response = await fetch(`${progressFileUrl()}?ref=${GITHUB_REPO_BRANCH}`, {
        headers: { ...cloudHeaders(), "Cache-Control": "no-cache" }
      });
      if (response.status === 404) throw new Error(`No progress file found at ${PROGRESS_FILE_PATH}.`);
      if (!response.ok) throw new Error(`GitHub repo load failed (${response.status})`);
      const file = await response.json();
      const payload = JSON.parse(decodeBase64(file.content || ""));
      const cloudCards = parseImportedDeck(JSON.stringify(payload));
      state.cards = mergeCards(cloudCards, state.cards);
      state.seedDeckVersion = Number(payload.seedDeckVersion || state.seedDeckVersion);
      saveCards({ cloud: false });
      renderAll();
      setMessage(`Loaded ${cloudCards.length} cards from ${PROGRESS_FILE_PATH}.`);
    } catch (error) {
      setMessage(error.message || "GitHub repo load failed.");
    }
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((candidate) => candidate.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.hidden = true;
        panel.classList.remove("is-active");
      });

      tab.classList.add("is-active");
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      panel.hidden = false;
      panel.classList.add("is-active");
    });
  });

  els.flashcard.addEventListener("click", revealCurrent);
  els.revealBtn.addEventListener("click", revealCurrent);
  els.listenBtn.addEventListener("click", speakCurrentFrench);
  els.spellBtn.addEventListener("click", spellCurrentFrench);

  els.ratingGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-rating]");
    if (!button) return;

    const card = currentCard();
    if (!card) return;

    const scheduled = scheduleCard(card, button.dataset.rating);
    state.cards = state.cards.map((candidate) => (candidate.id === card.id ? scheduled : candidate));
    state.currentIndex += 1;
    saveCards();
    renderAll();
  });

  els.cardForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const card = createCard({
        front: els.front.value,
        back: els.back.value,
        notes: els.notes.value,
        tags: els.tags.value,
        direction: els.direction.value
      });
      state.cards = [card, ...state.cards];
      saveCards();
      els.cardForm.reset();
      setMessage("Card saved.");
      renderAll();
    } catch (error) {
      setMessage(error.message);
    }
  });

  els.search.addEventListener("input", () => {
    state.browseVisibleCount = BROWSE_PAGE_SIZE;
    renderBrowse();
  });

  els.showMoreCardsBtn.addEventListener("click", () => {
    state.browseVisibleCount += BROWSE_PAGE_SIZE;
    renderBrowse();
  });

  els.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(createCloudPayload(state.cards, state.seedDeckVersion), null, 2)], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "french-flashcards.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  els.importBtn.addEventListener("click", () => {
    try {
      const imported = parseImportedDeck(els.importText.value);
      state.cards = mergeCards(state.cards, imported);
      saveCards();
      els.importText.value = "";
      setMessage(`Imported ${imported.length} cards.`);
      renderAll();
    } catch (error) {
      setMessage(error.message);
    }
  });

  els.saveSyncBtn.addEventListener("click", () => {
    state.cloud = {
      token: normalizeText(els.githubToken.value),
      autoSync: els.autoSync.checked
    };
    saveCloudSettings();
    setMessage("Repo sync settings saved on this device.");
  });

  els.syncNowBtn.addEventListener("click", () => {
    state.cloud = {
      token: normalizeText(els.githubToken.value),
      autoSync: els.autoSync.checked
    };
    saveCloudSettings();
    saveToGithub();
  });

  els.loadCloudBtn.addEventListener("click", () => {
    state.cloud = {
      token: normalizeText(els.githubToken.value),
      autoSync: els.autoSync.checked
    };
    saveCloudSettings();
    loadFromGithub();
  });

  els.resetLearningBtn.addEventListener("click", () => {
    if (!confirm("Reset all learning progress? Cards stay, ratings and due dates restart.")) return;
    state.cards = resetLearning(state.cards);
    state.currentIndex = 0;
    saveCards();
    renderAll();
    setMessage("Learning progress reset.");
  });

  saveCloudSettings();
  renderAll();
  loadSeedCards();
}

if (typeof module !== "undefined") {
  module.exports = {
    STORAGE_KEY,
    createCard,
    scheduleCard,
    getStudyQueue,
    hasBeenStudied,
    parseImportedDeck,
    mergeCards,
    syncSeedCards,
    resetLearning,
    createCloudPayload,
    shouldRetryRepoSave,
    createRepoSaveBody,
    getLearningStats,
    getFrenchText,
    buildSpellingText
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", startBrowserApp);
}










