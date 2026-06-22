const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
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
} = require("../app.js");

test("createCard requires front and back text", () => {
  assert.throws(() => createCard({ front: "", back: "bonjour" }), /Front is required/);
  assert.throws(() => createCard({ front: "hello", back: " " }), /Back is required/);
});

test("scheduleCard brings again cards back quickly", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const card = createCard({ front: "hello", back: "bonjour" }, now);
  const scheduled = scheduleCard(card, "again", now);

  assert.equal(scheduled.repetitions, 0);
  assert.equal(scheduled.lapses, 1);
  assert.equal(scheduled.intervalDays, 0);
  assert.equal(scheduled.dueAt, "2026-06-21T10:10:00.000Z");
});

test("scheduleCard expands intervals after successful recall", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const card = createCard({ front: "thank you", back: "merci" }, now);
  const first = scheduleCard(card, "good", now);
  const second = scheduleCard(first, "easy", new Date(first.dueAt));

  assert.equal(first.repetitions, 1);
  assert.equal(first.intervalDays, 1);
  assert.equal(second.repetitions, 2);
  assert.equal(second.intervalDays, 4);
});

test("getStudyQueue returns due cards before new cards", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const due = {
    ...createCard({ front: "due", back: "du" }, now),
    dueAt: "2026-06-20T10:00:00.000Z",
    repetitions: 1
  };
  const future = {
    ...createCard({ front: "future", back: "futur" }, now),
    dueAt: "2026-06-22T10:00:00.000Z",
    repetitions: 1
  };
  const fresh = createCard({ front: "new", back: "nouveau" }, now);

  const queue = getStudyQueue([future, fresh, due], now);
  assert.deepEqual(queue.map((card) => card.front), ["due", "new"]);
});
test("getStudyQueue returns again cards after their retry delay", () => {
  const start = new Date("2026-06-21T10:00:00.000Z");
  const retry = scheduleCard(createCard({ front: "again", back: "encore" }, start), "again", start);
  const earlyQueue = getStudyQueue([retry], new Date("2026-06-21T10:09:00.000Z"));
  const dueQueue = getStudyQueue([retry], new Date("2026-06-21T10:10:00.000Z"));

  assert.equal(hasBeenStudied(retry), true);
  assert.deepEqual(earlyQueue.map((card) => card.front), []);
  assert.deepEqual(dueQueue.map((card) => card.front), ["again"]);
});

test("parseImportedDeck rejects malformed imported data", () => {
  assert.throws(() => parseImportedDeck("{"), /Invalid JSON/);
  assert.throws(() => parseImportedDeck(JSON.stringify({ cards: [{ front: "x" }] })), /Back is required/);
});

test("mergeCards preserves existing cards and adds missing seed cards", () => {
  const existing = createCard({ id: "seed-xlsx-1", front: "changed", back: "changed" });
  const seed = [
    createCard({ id: "seed-xlsx-1", front: "bonjour", back: "hello" }),
    createCard({ id: "seed-xlsx-2", front: "merci", back: "thank you" })
  ];

  const merged = mergeCards([existing], seed);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((card) => card.id === "seed-xlsx-1").front, "changed");
  assert.equal(merged.find((card) => card.id === "seed-xlsx-2").front, "merci");
});


test("syncSeedCards updates built-in card text while preserving learning progress", () => {
  const oldSeed = {
    ...createCard({ id: "seed-xlsx-1", front: "bonjour", back: "hello", direction: "fr-en" }),
    repetitions: 3,
    intervalDays: 7,
    dueAt: "2026-07-10T00:00:00.000Z"
  };
  const userCard = createCard({ id: "user-1", front: "custom", back: "personnel" });
  const newSeed = createCard({ id: "seed-xlsx-1", front: "hello", back: "bonjour", direction: "en-fr", tags: "source:xlsx" });

  const synced = syncSeedCards([oldSeed, userCard], [newSeed]);
  const migrated = synced.find((card) => card.id === "seed-xlsx-1");

  assert.equal(synced.length, 2);
  assert.equal(migrated.front, "hello");
  assert.equal(migrated.back, "bonjour");
  assert.equal(migrated.direction, "en-fr");
  assert.equal(migrated.repetitions, 3);
  assert.equal(migrated.intervalDays, 7);
  assert.equal(migrated.dueAt, "2026-07-10T00:00:00.000Z");
  assert.equal(synced.find((card) => card.id === "user-1").front, "custom");
});
test("resetLearning keeps card text and clears scheduling progress", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const learned = scheduleCard(createCard({ front: "hello", back: "bonjour", tags: "A1" }, now), "good", now);
  const reset = resetLearning([learned], new Date("2026-07-01T12:00:00.000Z"));

  assert.equal(reset.length, 1);
  assert.equal(reset[0].front, "hello");
  assert.equal(reset[0].back, "bonjour");
  assert.equal(reset[0].tags, "A1");
  assert.equal(reset[0].repetitions, 0);
  assert.equal(reset[0].lapses, 0);
  assert.equal(reset[0].intervalDays, 0);
  assert.equal(reset[0].ease, 2.5);
  assert.equal(reset[0].dueAt, "2026-07-01T12:00:00.000Z");
});

test("getLearningStats reports studied percentage", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const fresh = createCard({ front: "fresh", back: "nouveau" }, now);
  const studied = scheduleCard(createCard({ front: "studied", back: "etudie" }, now), "good", now);
  const missed = scheduleCard(createCard({ front: "missed", back: "manque" }, now), "again", now);
  const stats = getLearningStats([fresh, studied, missed]);

  assert.deepEqual(stats, { total: 3, studied: 2, learnedPercent: 67 });
});

test("createCloudPayload stores david repo progress metadata", () => {
  const card = createCard({ id: "card-1", front: "merci", back: "thank you" });
  const payload = createCloudPayload([card], 3, new Date("2026-07-01T12:00:00.000Z"));

  assert.equal(payload.app, "FrenchFlashCards");
  assert.equal(payload.version, 2);
  assert.equal(payload.user, "david");
  assert.equal(payload.progressPath, "progress/david-progress.json");
  assert.equal(payload.seedDeckVersion, 3);
  assert.equal(payload.savedAt, "2026-07-01T12:00:00.000Z");
  assert.deepEqual(payload.stats, { total: 1, studied: 0, learnedPercent: 0 });
  assert.equal(payload.cards.length, 1);
  assert.equal(payload.cards[0].front, "merci");
});

test("createRepoSaveBody includes content, branch, and latest sha", () => {
  const body = createRepoSaveBody("progress text", "abc123");

  assert.equal(body.message, "chore: update david learning progress");
  assert.equal(body.branch, "main");
  assert.equal(body.sha, "abc123");
  assert.equal(Buffer.from(body.content, "base64").toString("utf8"), "progress text");
});

test("shouldRetryRepoSave retries GitHub conflict responses only", () => {
  assert.equal(shouldRetryRepoSave(409), true);
  assert.equal(shouldRetryRepoSave(401), false);
  assert.equal(shouldRetryRepoSave(422), false);
});

test("getFrenchText chooses the French side based on card direction", () => {
  const frenchFirst = createCard({ front: "bonjour", back: "hello", direction: "fr-en" });
  const frenchBack = createCard({ front: "thank you", back: "merci", direction: "en-fr" });

  assert.equal(getFrenchText(frenchFirst), "bonjour");
  assert.equal(getFrenchText(frenchBack), "merci");
});

test("buildSpellingText formats French text for slow spelling", () => {
  assert.equal(buildSpellingText("l'aéroport"), "l apostrophe a é r o p o r t");
  assert.equal(buildSpellingText("un vol"), "u n. v o l");
});

test("seed deck includes B1 handnote cards", () => {
  const seedPath = path.join(__dirname, "..", "data", "seed-cards.json");
  const raw = fs.readFileSync(seedPath, "utf8");
  const cards = parseImportedDeck(raw);
  const handnoteCards = cards.filter((card) => card.tags.includes("source:b1-handnotes"));

  assert.equal(handnoteCards.length, 146);
  assert.ok(handnoteCards.every((card) => card.direction === "en-fr"));
  assert.equal(handnoteCards[0].front, "How do you say 'housewife'?");
  assert.equal(handnoteCards[0].back, "une femme au foyer");
  assert.ok(handnoteCards.some((card) => card.back.includes("subjonctif")));
});
test("seed deck contains valid generated cards", () => {
  const seedPath = path.join(__dirname, "..", "data", "seed-cards.json");
  const raw = fs.readFileSync(seedPath, "utf8");
  const cards = parseImportedDeck(raw);

  assert.ok(cards.length > 700);
  assert.equal(cards.length, new Set(cards.map((card) => card.id)).size);
  assert.ok(cards.every((card) => card.front && card.back));
  assert.ok(cards.some((card) => card.tags.includes("B1")));
  assert.ok(cards.every((card) => card.direction === "en-fr"));
  assert.equal(cards[0].front, "airplane");
  assert.equal(cards[0].back, "un avion");
});








