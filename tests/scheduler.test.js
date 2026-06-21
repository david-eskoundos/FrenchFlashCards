const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCard,
  scheduleCard,
  getStudyQueue,
  parseImportedDeck
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

test("parseImportedDeck rejects malformed imported data", () => {
  assert.throws(() => parseImportedDeck("{"), /Invalid JSON/);
  assert.throws(() => parseImportedDeck(JSON.stringify({ cards: [{ front: "x" }] })), /Back is required/);
});
