const STORAGE_KEY = "french-flashcards-v1";
const CLOUD_SETTINGS_KEY = "french-flashcards-cloud-settings-v1";
const SUPABASE_SESSION_KEY = "french-flashcards-supabase-session-v1";
const SEED_DECK_URL = "data/seed-cards.json";
const SEED_DECK_VERSION = 3;
const PROGRESS_USER = "david";
const SUPABASE_PROGRESS_TABLE = "flashcard_progress";
const DEFAULT_SUPABASE_URL = "https://fnmixmpfpnxmutspisip.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_4UTG8D_G5staocT4D5pGaA_eadBfI_f";
const GITHUB_REPO_BRANCH = "main";
const PROGRESS_FILE_PATH = `progress/${PROGRESS_USER}-progress.json`;
const ATTACHED_PROGRESS_FILE_PATH = "progress/attached-progress.json";
const BUNDLED_PROGRESS_URLS = [ATTACHED_PROGRESS_FILE_PATH, PROGRESS_FILE_PATH];
const IMPORTED_PROGRESS_SOURCES_KEY = "french-flashcards-imported-progress-sources-v1";
const BROWSE_PAGE_SIZE = 25;
const APP_VERSION = "20260710-decks";
const LIBRARY_VERSION = 2;
const CLOUD_PAYLOAD_VERSION = 4;
const DEFAULT_DECK_ID = "deck-default";
const DEFAULT_DECK_NAME = "French Flashcards";
const UNTITLED_DECK_NAME = "Untitled deck";

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

function normalizeToken(value) {
  return normalizeText(value).replace(/[\s\u200B-\u200D\uFEFF]/g, "");
}

function normalizeUrl(value) {
  return normalizeText(value).replace(/\/+$/, "");
}

function createTimestampedBackupFilename(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `french-flashcards-${stamp}.json`;
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


function mergeCardsByLatestProgress(localCards, cloudCards) {
  const merged = new Map(localCards.map((card) => [card.id, card]));
  cloudCards.forEach((cloudCard) => {
    const localCard = merged.get(cloudCard.id);
    if (!localCard || new Date(cloudCard.updatedAt).getTime() > new Date(localCard.updatedAt).getTime()) {
      merged.set(cloudCard.id, cloudCard);
    }
  });
  return Array.from(merged.values());
}

function timestampMs(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function newestIso(...values) {
  const newest = values.reduce((latest, value) => Math.max(latest, timestampMs(value)), 0);
  return newest ? toIso(new Date(newest)) : values.find(Boolean) || toIso(new Date());
}

function oldestIso(...values) {
  const times = values.map(timestampMs).filter(Boolean);
  return times.length ? toIso(new Date(Math.min(...times))) : values.find(Boolean) || toIso(new Date());
}

function mergeProgressCard(localCard, incomingCard) {
  const localTime = timestampMs(localCard.updatedAt);
  const incomingTime = timestampMs(incomingCard.updatedAt);
  const textSource = incomingTime > localTime ? incomingCard : localCard;

  return {
    ...localCard,
    ...textSource,
    createdAt: oldestIso(localCard.createdAt, incomingCard.createdAt),
    updatedAt: newestIso(localCard.updatedAt, incomingCard.updatedAt),
    dueAt: newestIso(localCard.dueAt, incomingCard.dueAt),
    intervalDays: Math.max(Number(localCard.intervalDays || 0), Number(incomingCard.intervalDays || 0)),
    ease: Math.max(Number(localCard.ease || 2.5), Number(incomingCard.ease || 2.5)),
    repetitions: Math.max(Number(localCard.repetitions || 0), Number(incomingCard.repetitions || 0)),
    lapses: Math.max(Number(localCard.lapses || 0), Number(incomingCard.lapses || 0))
  };
}

function mergeProgressCards(localCards, incomingCards) {
  const merged = new Map(localCards.map((card) => [card.id, card]));
  incomingCards.forEach((incomingCard) => {
    const localCard = merged.get(incomingCard.id);
    merged.set(incomingCard.id, localCard ? mergeProgressCard(localCard, incomingCard) : incomingCard);
  });
  return Array.from(merged.values());
}

function makeDeckId() {
  return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => createCard(card));
}

function createDeck(input = {}, now = new Date()) {
  const deckInput = input && typeof input === "object" ? input : {};
  const id = normalizeText(deckInput.id) || makeDeckId();
  const name = normalizeText(deckInput.name) || (id === DEFAULT_DECK_ID ? DEFAULT_DECK_NAME : UNTITLED_DECK_NAME);
  const cards = Array.isArray(deckInput.cards)
    ? normalizeCards(deckInput.cards)
    : applyProgressEntries([], Array.isArray(deckInput.cardProgress) ? deckInput.cardProgress : []);

  return {
    id,
    name,
    createdAt: deckInput.createdAt || toIso(now),
    updatedAt: deckInput.updatedAt || toIso(now),
    seedDeckVersion: Number(deckInput.seedDeckVersion || 0),
    cards
  };
}

function createDefaultDeck(cards = [], seedDeckVersion = 0, now = new Date()) {
  return createDeck({
    id: DEFAULT_DECK_ID,
    name: DEFAULT_DECK_NAME,
    seedDeckVersion,
    cards
  }, now);
}

function normalizeLibrary(input = {}, now = new Date()) {
  const raw = input && typeof input === "object" ? input : {};

  if (Array.isArray(input) || Array.isArray(raw.cards) || Array.isArray(raw.cardProgress)) {
    const cards = Array.isArray(input)
      ? normalizeCards(input)
      : Array.isArray(raw.cards)
        ? normalizeCards(raw.cards)
        : applyProgressEntries([], raw.cardProgress);
    const defaultDeck = createDefaultDeck(cards, Number(raw.seedDeckVersion || 0), now);
    return {
      version: LIBRARY_VERSION,
      activeDeckId: DEFAULT_DECK_ID,
      decks: [defaultDeck]
    };
  }

  if (Array.isArray(raw.decks)) {
    const seen = new Set();
    const decks = raw.decks.map((deck, index) => {
      const normalized = createDeck(deck, now);
      if (!seen.has(normalized.id)) {
        seen.add(normalized.id);
        return normalized;
      }
      const unique = { ...normalized, id: `${normalized.id}-${index + 1}` };
      seen.add(unique.id);
      return unique;
    });
    const normalizedDecks = decks.length ? decks : [createDefaultDeck([], Number(raw.seedDeckVersion || 0), now)];
    const activeDeckId = normalizedDecks.some((deck) => deck.id === raw.activeDeckId)
      ? raw.activeDeckId
      : normalizedDecks[0].id;
    return {
      version: LIBRARY_VERSION,
      activeDeckId,
      decks: normalizedDecks
    };
  }

  return {
    version: LIBRARY_VERSION,
    activeDeckId: DEFAULT_DECK_ID,
    decks: [createDefaultDeck([], Number(raw.seedDeckVersion || 0), now)]
  };
}

function getActiveDeck(library) {
  const normalized = library && Array.isArray(library.decks) ? library : normalizeLibrary(library);
  return normalized.decks.find((deck) => deck.id === normalized.activeDeckId) || normalized.decks[0] || createDefaultDeck();
}

function replaceDeckById(library, deckId, nextDeck) {
  const normalized = normalizeLibrary(library);
  const replacement = createDeck(nextDeck);
  const decks = normalized.decks.map((deck) => (deck.id === deckId ? replacement : deck));
  return normalizeLibrary({
    version: LIBRARY_VERSION,
    activeDeckId: decks.some((deck) => deck.id === normalized.activeDeckId) ? normalized.activeDeckId : replacement.id,
    decks
  });
}

function replaceActiveDeck(library, nextDeck) {
  const normalized = normalizeLibrary(library);
  return replaceDeckById(normalized, normalized.activeDeckId, { ...nextDeck, id: normalized.activeDeckId });
}

function mergeDecks(localDeck, incomingDeck) {
  const localTime = timestampMs(localDeck.updatedAt);
  const incomingTime = timestampMs(incomingDeck.updatedAt);
  const textSource = incomingTime > localTime ? incomingDeck : localDeck;

  return createDeck({
    ...localDeck,
    ...textSource,
    id: localDeck.id,
    createdAt: oldestIso(localDeck.createdAt, incomingDeck.createdAt),
    updatedAt: newestIso(localDeck.updatedAt, incomingDeck.updatedAt),
    seedDeckVersion: Math.max(Number(localDeck.seedDeckVersion || 0), Number(incomingDeck.seedDeckVersion || 0)),
    cards: mergeProgressCards(localDeck.cards, incomingDeck.cards)
  });
}

function mergeLibraries(localLibrary, incomingLibrary) {
  const local = normalizeLibrary(localLibrary);
  const incoming = normalizeLibrary(incomingLibrary);
  const merged = new Map(local.decks.map((deck) => [deck.id, deck]));

  incoming.decks.forEach((incomingDeck) => {
    const localDeck = merged.get(incomingDeck.id);
    merged.set(incomingDeck.id, localDeck ? mergeDecks(localDeck, incomingDeck) : incomingDeck);
  });

  const decks = Array.from(merged.values());
  const activeDeckId = decks.some((deck) => deck.id === local.activeDeckId)
    ? local.activeDeckId
    : incoming.activeDeckId;

  return normalizeLibrary({ version: LIBRARY_VERSION, activeDeckId, decks });
}

function syncLibrarySeedCards(library, seedCards, seedDeckVersion) {
  const normalized = normalizeLibrary(library);
  const decks = [...normalized.decks];
  let defaultIndex = decks.findIndex((deck) => deck.id === DEFAULT_DECK_ID);
  if (defaultIndex < 0) {
    decks.unshift(createDefaultDeck([], 0));
    defaultIndex = 0;
  }

  const defaultDeck = decks[defaultIndex];
  if (Number(defaultDeck.seedDeckVersion || 0) >= seedDeckVersion) return normalized;

  decks[defaultIndex] = createDeck({
    ...defaultDeck,
    updatedAt: toIso(new Date()),
    seedDeckVersion,
    cards: syncSeedCards(defaultDeck.cards, seedCards)
  });

  return normalizeLibrary({ version: LIBRARY_VERSION, activeDeckId: normalized.activeDeckId, decks });
}

function getLibraryStats(library) {
  const normalized = normalizeLibrary(library);
  const total = normalized.decks.reduce((sum, deck) => sum + deck.cards.length, 0);
  const studied = normalized.decks.reduce((sum, deck) => sum + deck.cards.filter(hasBeenStudied).length, 0);
  const learnedPercent = total ? Math.round((studied / total) * 100) : 0;
  return { decks: normalized.decks.length, total, studied, learnedPercent };
}

function getLatestLibraryProgressTime(library) {
  return normalizeLibrary(library).decks.reduce((latest, deck) => {
    const deckLatest = getLatestProgressTime(deck.cards);
    return deckLatest > latest ? deckLatest : latest;
  }, 0);
}

function createLibraryPayload(library, now = new Date()) {
  const normalized = normalizeLibrary(library);
  const defaultDeck = normalized.decks.find((deck) => deck.id === DEFAULT_DECK_ID) || normalized.decks[0];

  return {
    app: "FrenchFlashCards",
    version: CLOUD_PAYLOAD_VERSION,
    user: PROGRESS_USER,
    progressPath: PROGRESS_FILE_PATH,
    seedDeckVersion: defaultDeck ? defaultDeck.seedDeckVersion : 0,
    savedAt: toIso(now),
    activeDeckId: normalized.activeDeckId,
    stats: getLibraryStats(normalized),
    decks: normalized.decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      seedDeckVersion: deck.seedDeckVersion,
      stats: getLearningStats(deck.cards),
      cardProgress: createProgressEntries(deck.cards)
    }))
  };
}

function payloadToLibrary(payload, baseLibrary) {
  if (!payload) return normalizeLibrary(baseLibrary);
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const base = normalizeLibrary(baseLibrary || {});

  if (Array.isArray(parsed) || Array.isArray(parsed.cards) || Array.isArray(parsed.cardProgress)) {
    const activeDeck = getActiveDeck(base);
    const incomingCards = Array.isArray(parsed.cardProgress)
      ? applyProgressEntries(activeDeck.cards, parsed.cardProgress)
      : normalizeCards(Array.isArray(parsed) ? parsed : parsed.cards);
    const cards = Array.isArray(parsed.cardProgress)
      ? incomingCards
      : mergeProgressCards(activeDeck.cards, incomingCards);
    return replaceActiveDeck(base, {
      ...activeDeck,
      seedDeckVersion: Math.max(Number(activeDeck.seedDeckVersion || 0), Number(parsed.seedDeckVersion || 0)),
      cards
    });
  }

  if (Array.isArray(parsed.decks)) {
    const decks = parsed.decks.map((deckPayload) => {
      const baseDeck = base.decks.find((deck) => deck.id === deckPayload.id);
      let cards = [];
      if (Array.isArray(deckPayload.cardProgress)) {
        cards = applyProgressEntries(baseDeck ? baseDeck.cards : [], deckPayload.cardProgress);
      } else if (Array.isArray(deckPayload.cards)) {
        cards = normalizeCards(deckPayload.cards);
      } else if (baseDeck) {
        cards = baseDeck.cards;
      }
      return createDeck({
        ...deckPayload,
        seedDeckVersion: Number(deckPayload.seedDeckVersion || (baseDeck && baseDeck.seedDeckVersion) || 0),
        cards
      });
    });
    return normalizeLibrary({
      version: LIBRARY_VERSION,
      activeDeckId: parsed.activeDeckId || base.activeDeckId,
      decks
    });
  }

  return normalizeLibrary(parsed);
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

function isSeedCard(card) {
  return String(card.id || "").startsWith("seed-");
}

function hasProgress(card) {
  return hasBeenStudied(card) || card.intervalDays > 0 || card.ease !== 2.5;
}

function createProgressEntry(card) {
  const progress = {
    id: card.id,
    updatedAt: card.updatedAt,
    dueAt: card.dueAt,
    intervalDays: card.intervalDays,
    ease: card.ease,
    repetitions: card.repetitions,
    lapses: card.lapses
  };
  if (!isSeedCard(card)) {
    return {
      ...progress,
      front: card.front,
      back: card.back,
      notes: card.notes,
      tags: card.tags,
      direction: card.direction,
      createdAt: card.createdAt
    };
  }
  return progress;
}

function createProgressEntries(cards) {
  return cards.filter((card) => hasProgress(card) || !isSeedCard(card)).map(createProgressEntry);
}

function getLatestProgressTime(cards) {
  return cards.reduce((latest, card) => {
    if (!hasProgress(card)) return latest;
    const updatedAt = new Date(card.updatedAt).getTime();
    return Number.isFinite(updatedAt) && updatedAt > latest ? updatedAt : latest;
  }, 0);
}

function getSupabaseRowSavedTime(row, payload = row && row.progress) {
  const savedAt = (row && (row.saved_at || row.updated_at)) || (payload && payload.savedAt);
  const timestamp = new Date(savedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function applyProgressEntries(cards, progressEntries) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  progressEntries.forEach((progress) => {
    const existing = cardsById.get(progress.id);
    if (existing) {
      cardsById.set(progress.id, { ...existing, ...progress });
      return;
    }
    if (progress.front && progress.back) cardsById.set(progress.id, createCard(progress));
  });
  return Array.from(cardsById.values());
}

function extractCloudCards(payload) {
  if (Array.isArray(payload.cardProgress)) return applyProgressEntries([], payload.cardProgress);
  return parseImportedDeck(JSON.stringify(payload));
}

function createCloudPayload(cards, seedDeckVersion, now = new Date()) {
  return {
    app: "FrenchFlashCards",
    version: 3,
    user: PROGRESS_USER,
    progressPath: PROGRESS_FILE_PATH,
    seedDeckVersion,
    savedAt: toIso(now),
    stats: getLearningStats(cards),
    cardProgress: createProgressEntries(cards)
  };
}

function createSupabaseProgressRow(userId, cardsOrLibrary, seedDeckVersion, now = new Date()) {
  const savedAt = toIso(now);
  const isLibrary = cardsOrLibrary && typeof cardsOrLibrary === "object" && Array.isArray(cardsOrLibrary.decks);
  const progress = isLibrary
    ? createLibraryPayload(cardsOrLibrary, now)
    : createCloudPayload(cardsOrLibrary, seedDeckVersion, now);
  const defaultDeck = isLibrary ? getActiveDeck(normalizeLibrary({ ...cardsOrLibrary, activeDeckId: DEFAULT_DECK_ID })) : null;
  return {
    user_id: userId,
    app: "FrenchFlashCards",
    progress,
    seed_deck_version: isLibrary ? Number((defaultDeck && defaultDeck.seedDeckVersion) || 0) : seedDeckVersion,
    saved_at: savedAt,
    updated_at: savedAt
  };
}

function extractSupabaseProgressPayload(row) {
  if (!row || !row.progress) throw new Error("No cloud progress found.");
  return row.progress;
}

function decodeJwtPayload(token) {
  const payload = String(token || "").split(".")[1];
  if (!payload) throw new Error("Missing JWT payload.");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  return JSON.parse(decodeBase64(base64));
}

function isJwtExpired(token, now = new Date(), skewSeconds = 60) {
  const payload = decodeJwtPayload(token);
  if (!payload.exp) return false;
  return payload.exp * 1000 <= now.getTime() + skewSeconds * 1000;
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

function formatGitHubError(action, status, detail = "") {
  const suffix = detail ? `: ${detail}` : ".";
  return `${action} failed (${status})${suffix}`;
}

function isGenericNetworkError(error) {
  const detail = error && error.message ? error.message : "network request failed";
  return new Set([
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource."
  ]).has(detail);
}

function formatNetworkError(action, error) {
  const detail = error && error.message ? error.message : "network request failed";
  if (isGenericNetworkError(error)) {
    return `${action} failed: Browser could not reach GitHub. Keep this token, export JSON as backup, then try again on Chrome or Wi-Fi.`;
  }

  return `${action} failed: ${detail}`;
}

function createXhrResponse(xhr) {
  return {
    ok: xhr.status >= 200 && xhr.status < 300,
    status: xhr.status,
    async text() {
      return xhr.responseText || "";
    },
    async json() {
      return JSON.parse(xhr.responseText || "{}");
    }
  };
}

function requestWithXhr(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new Error("XMLHttpRequest is not available"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", url, true);
    xhr.timeout = 20000;
    Object.entries(options.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.onload = () => resolve(createXhrResponse(xhr));
    xhr.onerror = () => reject(new Error("Browser network request failed"));
    xhr.ontimeout = () => reject(new Error("GitHub request timed out"));
    xhr.send(options.body || null);
  });
}

async function githubRequest(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (isGenericNetworkError(error)) return requestWithXhr(url, options);
    throw error;
  }
}

async function readGitHubError(response, action) {
  let detail = "";
  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        detail = parsed.message || text.slice(0, 160);
      } catch {
        detail = text.slice(0, 160);
      }
    }
  } catch {
    detail = "";
  }
  return new Error(formatGitHubError(action, response.status, detail));
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
function readStoredLibrary() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return normalizeLibrary({});
    return normalizeLibrary(JSON.parse(stored));
  } catch {
    return normalizeLibrary({});
  }
}

function startBrowserApp() {
  const els = {
    dueCount: document.getElementById("dueCount"),
    newCount: document.getElementById("newCount"),
    learnedPercent: document.getElementById("learnedPercent"),
    deckSelect: document.getElementById("deckSelect"),
    deckSummary: document.getElementById("deckSummary"),
    createDeckBtn: document.getElementById("createDeckBtn"),
    renameDeckBtn: document.getElementById("renameDeckBtn"),
    deleteDeckBtn: document.getElementById("deleteDeckBtn"),
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
    copyBackupBtn: document.getElementById("copyBackupBtn"),
    backupText: document.getElementById("backupText"),
    importText: document.getElementById("importText"),
    importBtn: document.getElementById("importBtn"),
    supabaseUrl: document.getElementById("supabaseUrl"),
    supabaseKey: document.getElementById("supabaseKey"),
    supabaseEmail: document.getElementById("supabaseEmail"),
    supabaseSignInBtn: document.getElementById("supabaseSignInBtn"),
    supabaseSignOutBtn: document.getElementById("supabaseSignOutBtn"),
    supabaseSyncBtn: document.getElementById("supabaseSyncBtn"),
    supabaseLoadBtn: document.getElementById("supabaseLoadBtn"),
    cloudStatus: document.getElementById("cloudStatus"),
    appVersion: document.getElementById("appVersion"),
    listenBtn: document.getElementById("listenBtn"),
    spellBtn: document.getElementById("spellBtn"),
    spellingLine: document.getElementById("spellingLine"),
    resetLearningBtn: document.getElementById("resetLearningBtn"),
    message: document.getElementById("message")
  };

  const state = {
    library: readStoredLibrary(),
    queue: [],
    currentIndex: 0,
    revealed: false,
    browseVisibleCount: BROWSE_PAGE_SIZE,
    cloud: readCloudSettings(),
    cloudSession: null,
    cloudUser: null
  };

  function setMessage(text) {
    els.message.textContent = text;
  }

  function setCloudStatus(text) {
    setMessage(text);
    if (els.cloudStatus) els.cloudStatus.textContent = text;
  }

  function activeDeck() {
    return getActiveDeck(state.library);
  }

  function setLibrary(nextLibrary) {
    state.library = normalizeLibrary(nextLibrary);
  }

  function setActiveDeck(nextDeck) {
    setLibrary(replaceActiveDeck(state.library, { ...nextDeck, updatedAt: toIso(new Date()) }));
  }

  function readCloudSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CLOUD_SETTINGS_KEY) || "{}");
      return {
        supabaseUrl: normalizeUrl(parsed.supabaseUrl || DEFAULT_SUPABASE_URL),
        supabaseKey: normalizeToken(parsed.supabaseKey || DEFAULT_SUPABASE_KEY),
        email: normalizeText(parsed.email)
      };
    } catch {
      return { supabaseUrl: DEFAULT_SUPABASE_URL, supabaseKey: DEFAULT_SUPABASE_KEY, email: "" };
    }
  }

  function saveCloudSettings() {
    localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(state.cloud));
    els.supabaseUrl.value = state.cloud.supabaseUrl || "";
    els.supabaseKey.value = state.cloud.supabaseKey || "";
    els.supabaseEmail.value = state.cloud.email || "";
    els.appVersion.textContent = APP_VERSION;
    renderCloudStatus();
  }

  function createBackupJson() {
    return JSON.stringify(createLibraryPayload(state.library), null, 2);
  }

  async function copyBackupToClipboard() {
    const backup = createBackupJson();
    els.backupText.hidden = false;
    els.backupText.value = backup;
    els.backupText.focus();
    els.backupText.select();

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(backup);
        setMessage("Backup copied.");
        return;
      }
      document.execCommand("copy");
      setMessage("Backup selected and copied.");
    } catch {
      setMessage("Backup is shown below. Select it and copy it.");
    }
  }

  function saveCards(options = {}) {
    try {
      setLibrary(state.library);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.library));
      if (options.cloud !== false) setMessage("Saved in this browser.");
    } catch {
      setMessage("Storage failed. Export your library before closing this browser.");
    }
  }

  async function loadSeedCards() {
    const defaultDeck = state.library.decks.find((deck) => deck.id === DEFAULT_DECK_ID) || createDefaultDeck();
    if (Number(defaultDeck.seedDeckVersion || 0) >= SEED_DECK_VERSION && defaultDeck.cards.length > 0) return;

    try {
      const response = await fetch(SEED_DECK_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Seed deck unavailable");
      const text = await response.text();
      const seedCards = parseImportedDeck(text);
      const before = defaultDeck.cards.length;
      setLibrary(syncLibrarySeedCards(state.library, seedCards, SEED_DECK_VERSION));
      saveCards({ cloud: false });
      renderAll();
      const nextDefaultDeck = state.library.decks.find((deck) => deck.id === DEFAULT_DECK_ID) || createDefaultDeck();
      const added = nextDefaultDeck.cards.length - before;
      if (added > 0) setMessage(`Loaded ${added} built-in cards.`);
    } catch {
      setMessage("Built-in cards could not be loaded. You can still add your own cards.");
    }
  }

  function refreshQueue() {
    state.queue = getStudyQueue(activeDeck().cards);
    state.currentIndex = Math.min(state.currentIndex, Math.max(state.queue.length - 1, 0));
    state.revealed = false;
  }

  function currentCard() {
    return state.queue[state.currentIndex];
  }

  function renderDecks() {
    if (!els.deckSelect) return;
    const current = activeDeck();
    els.deckSelect.innerHTML = "";
    state.library.decks.forEach((deck) => {
      const option = document.createElement("option");
      option.value = deck.id;
      option.textContent = deck.name;
      els.deckSelect.append(option);
    });
    els.deckSelect.value = current.id;
    if (els.deckSummary) {
      const stats = getLearningStats(current.cards);
      els.deckSummary.textContent = `${stats.total} cards, ${stats.studied} studied`;
    }
    if (els.deleteDeckBtn) els.deleteDeckBtn.disabled = state.library.decks.length <= 1;
  }

  function renderStats() {
    const cards = activeDeck().cards;
    const now = Date.now();
    const due = cards.filter((card) => hasBeenStudied(card) && new Date(card.dueAt).getTime() <= now).length;
    const fresh = cards.filter((card) => card.repetitions === 0 && card.lapses === 0).length;
    els.dueCount.textContent = String(due);
    els.newCount.textContent = String(fresh);
    els.learnedPercent.textContent = `${getLearningStats(cards).learnedPercent}%`;
  }

  function renderStudy() {
    refreshQueue();
    renderStats();
    const deck = activeDeck();
    const card = currentCard();

    els.ratingGrid.hidden = true;
    els.cardAnswer.hidden = true;
    els.revealBtn.hidden = false;

    if (!card) {
      els.cardPosition.textContent = deck.cards.length ? "All caught up" : "No cards";
      els.cardTags.textContent = deck.name;
      els.cardPrompt.textContent = deck.cards.length
        ? "No cards are due right now."
        : deck.id === DEFAULT_DECK_ID
          ? "Loading built-in cards..."
          : "This deck has no cards yet.";
      els.cardAnswer.textContent = "";
      els.cardNotes.textContent = deck.cards.length ? "Come back later or add a new card." : "Add a card to start this deck.";
      els.revealBtn.disabled = true;
      return;
    }

    els.revealBtn.disabled = false;
    els.cardPosition.textContent = `${state.currentIndex + 1} of ${state.queue.length}`;
    els.cardTags.textContent = card.tags || deck.name;
    els.cardPrompt.textContent = card.front;
    els.cardAnswer.textContent = card.back;
    els.cardNotes.textContent = card.notes;
  }

  function renderBrowse() {
    const query = normalizeText(els.search.value).toLowerCase();
    const deck = activeDeck();
    const cards = deck.cards.filter((card) => {
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
        const current = activeDeck();
        setActiveDeck({ ...current, cards: current.cards.filter((candidate) => candidate.id !== card.id) });
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
    renderDecks();
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

  function readCloudForm() {
    state.cloud = {
      supabaseUrl: normalizeUrl(els.supabaseUrl.value),
      supabaseKey: normalizeToken(els.supabaseKey.value),
      email: normalizeText(els.supabaseEmail.value)
    };
    saveCloudSettings();
  }

  function hasSupabaseSettings() {
    return Boolean(state.cloud.supabaseUrl && state.cloud.supabaseKey);
  }

  function supabaseUrl(path = "") {
    return `${state.cloud.supabaseUrl}${path}`;
  }

  function supabaseHeaders(token = "") {
    return {
      apikey: state.cloud.supabaseKey,
      Authorization: `Bearer ${token || state.cloud.supabaseKey}`,
      "Content-Type": "application/json"
    };
  }

  function renderCloudStatus() {
    if (!els.cloudStatus) return;
    if (!hasSupabaseSettings()) {
      els.cloudStatus.textContent = "Cloud sync is not configured.";
    } else if (state.cloudUser) {
      els.cloudStatus.textContent = `Signed in as ${state.cloudUser.email || state.cloud.email || "Supabase user"}.`;
    } else {
      els.cloudStatus.textContent = "Supabase configured. Sign in to sync manually.";
    }
    els.supabaseSignOutBtn.disabled = !state.cloudUser;
    els.supabaseSyncBtn.disabled = !state.cloudUser;
    els.supabaseLoadBtn.disabled = !state.cloudUser;
  }

  function saveSupabaseSession(session) {
    state.cloudSession = session;
    if (!session) {
      state.cloudUser = null;
      localStorage.removeItem(SUPABASE_SESSION_KEY);
      renderCloudStatus();
      return;
    }
    const claims = decodeJwtPayload(session.access_token);
    state.cloudUser = { id: claims.sub, email: claims.email || state.cloud.email };
    localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
    renderCloudStatus();
  }

  function readSessionFromUrl() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    if (!accessToken) return null;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return {
      access_token: accessToken,
      refresh_token: hash.get("refresh_token") || "",
      token_type: hash.get("token_type") || "bearer"
    };
  }

  async function refreshSupabaseSession() {
    if (!state.cloudSession || !state.cloudSession.refresh_token) {
      saveSupabaseSession(null);
      throw new Error("Session expired. Send a new magic link, then try again.");
    }
    setCloudStatus("Refreshing Supabase session...");
    const response = await fetch(`${supabaseUrl("/auth/v1/token")}?grant_type=refresh_token`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({ refresh_token: state.cloudSession.refresh_token })
    });
    const text = await response.text();
    if (!response.ok) {
      saveSupabaseSession(null);
      throw new Error(text || "Session expired. Send a new magic link, then try again.");
    }
    const refreshed = JSON.parse(text);
    saveSupabaseSession({
      ...state.cloudSession,
      ...refreshed,
      refresh_token: refreshed.refresh_token || state.cloudSession.refresh_token
    });
    return state.cloudSession;
  }

  async function ensureFreshSupabaseSession() {
    if (!state.cloudUser || !state.cloudSession) {
      throw new Error("Sign in with Supabase first.");
    }
    if (!isJwtExpired(state.cloudSession.access_token)) return state.cloudSession;
    return refreshSupabaseSession();
  }

  function restoreSupabaseSession() {
    try {
      const session = readSessionFromUrl() || JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || "null");
      if (!session || !session.access_token) {
        renderCloudStatus();
        return;
      }
      saveSupabaseSession(session);
      setCloudStatus(`Signed in as ${state.cloudUser.email || state.cloudUser.id}.`);
    } catch (error) {
      saveSupabaseSession(null);
      setCloudStatus(`Supabase session restore failed: ${error.message}`);
    }
  }

  async function signInWithSupabase() {
    readCloudForm();
    if (!hasSupabaseSettings()) {
      setCloudStatus("Add Supabase URL and publishable key first.");
      return;
    }
    if (!state.cloud.email) {
      setCloudStatus("Enter your email before sending the magic link.");
      return;
    }
    els.supabaseSignInBtn.disabled = true;
    els.supabaseSignInBtn.textContent = "Sending...";
    setCloudStatus(`Sending magic link to ${state.cloud.email}...`);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const response = await fetch(`${supabaseUrl("/auth/v1/otp")}?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({ email: state.cloud.email, create_user: true })
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
      setCloudStatus(`Magic link sent to ${state.cloud.email}. Check inbox and spam.`);
    } catch (error) {
      setCloudStatus(`Magic link failed: ${error.message}`);
    } finally {
      els.supabaseSignInBtn.disabled = false;
      els.supabaseSignInBtn.textContent = "Send magic link";
    }
  }

  async function saveToSupabase() {
    readCloudForm();
    if (!state.cloudUser || !state.cloudSession) {
      setCloudStatus("Sign in with Supabase before syncing.");
      return false;
    }
    if (getLibraryStats(state.library).total === 0) {
      setCloudStatus("Cards are still loading. Wait for the built-in deck before syncing.");
      return false;
    }
    setCloudStatus("Saving progress to Supabase...");
    try {
      await ensureFreshSupabaseSession();
      const row = createSupabaseProgressRow(state.cloudUser.id, state.library);
      const response = await fetch(`${supabaseUrl(`/rest/v1/${SUPABASE_PROGRESS_TABLE}`)}?on_conflict=user_id`, {
        method: "POST",
        headers: {
          ...supabaseHeaders(state.cloudSession.access_token),
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(row)
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
      setCloudStatus("Progress saved to Supabase.");
      return true;
    } catch (error) {
      setCloudStatus(`Supabase save failed: ${error.message}`);
      return false;
    }
  }

  async function loadFromSupabase() {
    readCloudForm();
    if (!state.cloudUser || !state.cloudSession) {
      setCloudStatus("Sign in with Supabase before loading cloud progress.");
      return;
    }
    setCloudStatus("Loading progress from Supabase...");
    try {
      await ensureFreshSupabaseSession();
      const response = await fetch(`${supabaseUrl(`/rest/v1/${SUPABASE_PROGRESS_TABLE}`)}?user_id=eq.${encodeURIComponent(state.cloudUser.id)}&select=*`, {
        headers: supabaseHeaders(state.cloudSession.access_token)
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
      const rows = JSON.parse(text || "[]");
      if (!rows.length) {
        setCloudStatus("No cloud progress yet. Press Sync now to upload this device.");
        return;
      }
      const payload = extractSupabaseProgressPayload(rows[0]);
      const baseLibrary = payload && Array.isArray(payload.decks)
        ? state.library
        : { ...state.library, activeDeckId: DEFAULT_DECK_ID };
      const cloudLibrary = payloadToLibrary(payload, baseLibrary);
      const localStats = getLibraryStats(state.library);
      const cloudStats = getLibraryStats(cloudLibrary);
      const localProgressTime = getLatestLibraryProgressTime(state.library);
      const cloudProgressTime = getSupabaseRowSavedTime(rows[0], payload);
      if (localProgressTime > cloudProgressTime) {
        setCloudStatus(`Cloud progress is older (${cloudStats.studied} studied). This browser has ${localStats.studied}. Press Sync now to upload this device.`);
        return;
      }
      setLibrary(mergeLibraries(state.library, cloudLibrary));
      saveCards({ cloud: false });
      renderAll();
      const stats = getLibraryStats(state.library);
      setCloudStatus(`Loaded cloud progress: ${stats.studied} of ${stats.total} studied across ${stats.decks} decks.`);
    } catch (error) {
      setCloudStatus(`Supabase load failed: ${error.message}`);
    }
  }

  function signOutOfSupabase() {
    saveSupabaseSession(null);
    setCloudStatus("Signed out of Supabase on this device.");
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

  els.deckSelect.addEventListener("change", () => {
    setLibrary({ ...state.library, activeDeckId: els.deckSelect.value });
    state.currentIndex = 0;
    state.browseVisibleCount = BROWSE_PAGE_SIZE;
    saveCards({ cloud: false, message: false });
    renderAll();
  });

  els.createDeckBtn.addEventListener("click", () => {
    const name = normalizeText(prompt("New deck name", "New deck"));
    if (!name) return;
    const deck = createDeck({ name });
    setLibrary({ ...state.library, activeDeckId: deck.id, decks: [...state.library.decks, deck] });
    state.currentIndex = 0;
    state.browseVisibleCount = BROWSE_PAGE_SIZE;
    saveCards();
    renderAll();
    setMessage(`Created ${deck.name}.`);
  });

  els.renameDeckBtn.addEventListener("click", () => {
    const current = activeDeck();
    const name = normalizeText(prompt("Deck name", current.name));
    if (!name || name === current.name) return;
    setActiveDeck({ ...current, name });
    saveCards();
    renderAll();
    setMessage("Deck renamed.");
  });

  els.deleteDeckBtn.addEventListener("click", () => {
    if (state.library.decks.length <= 1) {
      setMessage("You need at least one deck.");
      return;
    }
    const current = activeDeck();
    if (!confirm(`Delete ${current.name}? Cards and progress in this deck will be removed.`)) return;
    const decks = state.library.decks.filter((deck) => deck.id !== current.id);
    setLibrary({ version: LIBRARY_VERSION, activeDeckId: decks[0].id, decks });
    state.currentIndex = 0;
    state.browseVisibleCount = BROWSE_PAGE_SIZE;
    saveCards();
    renderAll();
    setMessage("Deck deleted.");
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

    const deck = activeDeck();
    const scheduled = scheduleCard(card, button.dataset.rating);
    setActiveDeck({ ...deck, cards: deck.cards.map((candidate) => (candidate.id === card.id ? scheduled : candidate)) });
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
      const deck = activeDeck();
      setActiveDeck({ ...deck, cards: [card, ...deck.cards] });
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
    const backup = createBackupJson();
    els.backupText.hidden = false;
    els.backupText.value = backup;
    const blob = new Blob([backup], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = createTimestampedBackupFilename();
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage("Exported timestamped JSON backup. Progress is also saved in this browser.");
  });

  els.copyBackupBtn.addEventListener("click", copyBackupToClipboard);

  els.supabaseSignInBtn.addEventListener("click", signInWithSupabase);
  els.supabaseSignOutBtn.addEventListener("click", signOutOfSupabase);
  els.supabaseSyncBtn.addEventListener("click", saveToSupabase);
  els.supabaseLoadBtn.addEventListener("click", loadFromSupabase);
  [els.supabaseUrl, els.supabaseKey, els.supabaseEmail].forEach((input) => {
    input.addEventListener("change", () => {
      readCloudForm();
    });
  });

  els.importBtn.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(els.importText.value);
      const importedLibrary = payloadToLibrary(parsed, state.library);
      setLibrary(Array.isArray(parsed.decks) ? mergeLibraries(state.library, importedLibrary) : importedLibrary);
      saveCards();
      els.importText.value = "";
      setMessage(Array.isArray(parsed.decks) ? `Imported ${importedLibrary.decks.length} decks.` : "Imported cards into this deck.");
      renderAll();
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "Invalid JSON" : error.message);
    }
  });

  els.resetLearningBtn.addEventListener("click", () => {
    if (!confirm("Reset learning progress in this deck? Cards stay, ratings and due dates restart.")) return;
    const deck = activeDeck();
    setActiveDeck({ ...deck, cards: resetLearning(deck.cards) });
    state.currentIndex = 0;
    saveCards();
    renderAll();
    setMessage("Learning progress reset for this deck.");
  });

  renderAll();
  loadSeedCards();
  saveCloudSettings();
  restoreSupabaseSession();
}

if (typeof module !== "undefined") {
  module.exports = {
    APP_VERSION,
    STORAGE_KEY,
    normalizeToken,
    normalizeUrl,
    createCard,
    scheduleCard,
    getStudyQueue,
    hasBeenStudied,
    parseImportedDeck,
    mergeCards,
    mergeCardsByLatestProgress,
    createDeck,
    normalizeLibrary,
    getActiveDeck,
    replaceActiveDeck,
    mergeLibraries,
    syncLibrarySeedCards,
    createLibraryPayload,
    payloadToLibrary,
    getLibraryStats,
    getLatestLibraryProgressTime,
    mergeProgressCards,
    syncSeedCards,
    resetLearning,
    createCloudPayload,
    createSupabaseProgressRow,
    extractSupabaseProgressPayload,
    decodeJwtPayload,
    isJwtExpired,
    extractCloudCards,
    applyProgressEntries,
    createProgressEntries,
    shouldRetryRepoSave,
    formatGitHubError,
    isGenericNetworkError,
    formatNetworkError,
    getLatestProgressTime,
    getSupabaseRowSavedTime,
    createRepoSaveBody,
    createTimestampedBackupFilename,
    getLearningStats,
    getFrenchText,
    buildSpellingText
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", startBrowserApp);
}










