# French Flashcard Study Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first static French flashcard study site that can be published with GitHub Pages.

**Architecture:** The site is plain HTML, CSS, and JavaScript served directly from the repository root. `app.js` exposes small pure functions for scheduler, queue, and import validation so they can be tested with Node while also powering the browser UI.

**Tech Stack:** Static HTML5, CSS3, vanilla JavaScript, Node built-in test runner, GitHub Pages.

---

## File Structure

- `index.html`: Creates the semantic app shell, flashcard study area, add-card form, browse/search panel, and import/export controls.
- `styles.css`: Defines the mobile-first interface, desktop layout, tap targets, card sizing, and accessible states.
- `app.js`: Contains pure scheduler/storage helpers plus browser rendering and event handlers.
- `tests/scheduler.test.js`: Tests scheduling, queue ordering, card validation, and import parsing with Node.
- `.nojekyll`: Ensures GitHub Pages serves static files directly.
- `README.md`: Explains the app, GitHub Pages publishing, and science-based flashcard habits.

### Task 1: Initialize Static App Test Surface

**Files:**
- Create: `tests/scheduler.test.js`
- Create: `app.js`
- Create: `package.json`

- [ ] **Step 1: Write failing scheduler tests**

Create `tests/scheduler.test.js`:

```js
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
  const due = { ...createCard({ front: "due", back: "du" }, now), dueAt: "2026-06-20T10:00:00.000Z", repetitions: 1 };
  const future = { ...createCard({ front: "future", back: "futur" }, now), dueAt: "2026-06-22T10:00:00.000Z", repetitions: 1 };
  const fresh = createCard({ front: "new", back: "nouveau" }, now);

  const queue = getStudyQueue([future, fresh, due], now);
  assert.deepEqual(queue.map((card) => card.front), ["due", "new"]);
});

test("parseImportedDeck rejects malformed imported data", () => {
  assert.throws(() => parseImportedDeck("{"), /Invalid JSON/);
  assert.throws(() => parseImportedDeck(JSON.stringify({ cards: [{ front: "x" }] })), /Back is required/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scheduler.test.js`

Expected: FAIL because `../app.js` does not exist or does not export the required functions.

- [ ] **Step 3: Add minimal testable scheduler module**

Create `app.js` with CommonJS-compatible exports and browser-safe guards:

```js
const STORAGE_KEY = "french-flashcards-v1";

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

function getStudyQueue(cards, now = new Date()) {
  const nowTime = new Date(now).getTime();
  const due = cards
    .filter((card) => card.repetitions > 0 && new Date(card.dueAt).getTime() <= nowTime)
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

if (typeof module !== "undefined") {
  module.exports = { STORAGE_KEY, createCard, scheduleCard, getStudyQueue, parseImportedDeck };
}
```

- [ ] **Step 4: Add package test command**

Create `package.json`:

```json
{
  "scripts": {
    "test": "node --test tests/scheduler.test.js"
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`

Expected: PASS with all five scheduler tests passing.

### Task 2: Build Mobile-First Interface

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Modify: `app.js`
- Create: `.nojekyll`

- [ ] **Step 1: Add static HTML shell**

Create `index.html` with linked CSS and JS:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>French Flashcards</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="app">
    <header class="topbar">
      <div>
        <p class="kicker">French study</p>
        <h1>Flashcards</h1>
      </div>
      <div class="stats" aria-live="polite">
        <span><strong id="dueCount">0</strong> due</span>
        <span><strong id="newCount">0</strong> new</span>
      </div>
    </header>

    <section class="workspace" aria-label="Flashcard workspace">
      <section class="study-panel" aria-label="Study card">
        <div class="card-shell">
          <div class="card-meta">
            <span id="cardPosition">No cards</span>
            <span id="cardTags"></span>
          </div>
          <button class="flashcard" id="flashcard" type="button">
            <span id="cardPrompt">Add your first French card to begin.</span>
            <span id="cardAnswer" hidden></span>
          </button>
          <p class="notes" id="cardNotes"></p>
        </div>
        <div class="actions">
          <button id="revealBtn" type="button">Reveal</button>
          <div class="rating-grid" id="ratingGrid" hidden>
            <button data-rating="again" type="button">Again</button>
            <button data-rating="hard" type="button">Hard</button>
            <button data-rating="good" type="button">Good</button>
            <button data-rating="easy" type="button">Easy</button>
          </div>
        </div>
      </section>

      <section class="manage-panel" aria-label="Manage cards">
        <nav class="tabs" aria-label="Card tools">
          <button class="tab is-active" data-tab="add" type="button">Add</button>
          <button class="tab" data-tab="browse" type="button">Browse</button>
          <button class="tab" data-tab="data" type="button">Data</button>
        </nav>

        <section class="tab-panel is-active" id="tab-add">
          <form id="cardForm">
            <label>Front <textarea id="front" required rows="3"></textarea></label>
            <label>Back <textarea id="back" required rows="3"></textarea></label>
            <label>Notes <input id="notes" type="text"></label>
            <label>Tags <input id="tags" type="text" placeholder="vocab, B1"></label>
            <label>Direction
              <select id="direction">
                <option value="fr-en">French to meaning</option>
                <option value="en-fr">Meaning to French</option>
              </select>
            </label>
            <button type="submit">Save card</button>
          </form>
        </section>

        <section class="tab-panel" id="tab-browse" hidden>
          <input id="search" type="search" placeholder="Search cards">
          <div class="card-list" id="cardList"></div>
        </section>

        <section class="tab-panel" id="tab-data" hidden>
          <button id="exportBtn" type="button">Export JSON</button>
          <label>Import JSON <textarea id="importText" rows="5"></textarea></label>
          <button id="importBtn" type="button">Import cards</button>
        </section>
      </section>
    </section>

    <p class="message" id="message" role="status" aria-live="polite"></p>
  </main>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add responsive CSS**

Create `styles.css` with stable mobile-first layout:

```css
:root {
  color-scheme: light;
  --ink: #17201a;
  --muted: #5f6b63;
  --line: #d9dfd8;
  --paper: #fffdf8;
  --surface: #f4f7f1;
  --accent: #2f6f5e;
  --accent-strong: #1f5448;
  --warn: #a4442f;
  --gold: #c9892b;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--surface);
  color: var(--ink);
}

button, input, textarea, select {
  font: inherit;
}

button {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
}

button:active { transform: translateY(1px); }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 3px solid rgba(47, 111, 94, 0.25);
  outline-offset: 2px;
}

.app {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 18px;
}

.topbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.kicker {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 14px;
}

h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1;
}

.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.stats span {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--paper);
  color: var(--muted);
}

.workspace {
  display: grid;
  gap: 16px;
}

.study-panel, .manage-panel {
  min-width: 0;
}

.card-shell, .manage-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}

.card-shell {
  padding: 14px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: 24px;
  color: var(--muted);
  font-size: 14px;
}

.flashcard {
  width: 100%;
  min-height: 240px;
  margin: 10px 0;
  padding: 22px;
  display: grid;
  place-items: center;
  text-align: center;
  font-size: 26px;
  line-height: 1.25;
  border-color: #cbd7cf;
  background: #fffaf0;
}

.flashcard span {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.notes {
  min-height: 22px;
  margin: 0;
  color: var(--muted);
}

.actions {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

#revealBtn, form button[type="submit"], #exportBtn, #importBtn {
  background: var(--accent);
  color: white;
  border-color: var(--accent-strong);
}

.rating-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.rating-grid button[data-rating="again"] { border-color: var(--warn); color: var(--warn); }
.rating-grid button[data-rating="easy"] { border-color: var(--gold); color: #7b4d08; }

.tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--line);
}

.tab.is-active {
  background: var(--accent);
  color: white;
  border-color: var(--accent-strong);
}

.tab-panel {
  padding: 14px;
}

form, .tab-panel {
  display: grid;
  gap: 12px;
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
}

input, textarea, select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  background: white;
  color: var(--ink);
}

.card-list {
  display: grid;
  gap: 8px;
}

.list-item {
  display: grid;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
}

.list-item strong, .list-item span {
  overflow-wrap: anywhere;
}

.list-actions {
  display: flex;
  gap: 8px;
}

.message {
  min-height: 24px;
  color: var(--accent-strong);
}

@media (min-width: 780px) {
  .app {
    padding: 28px;
  }

  .workspace {
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
    align-items: start;
  }

  .flashcard {
    min-height: 360px;
    font-size: 34px;
  }
}
```

- [ ] **Step 3: Extend browser app behavior in `app.js`**

Append browser initialization that loads cards, renders tabs, creates cards, studies cards, browses cards, and imports/exports data while keeping existing exports.

- [ ] **Step 4: Create `.nojekyll`**

Create an empty `.nojekyll` file.

- [ ] **Step 5: Run automated tests**

Run: `npm test`

Expected: PASS.

### Task 3: Documentation, Local Verification, Commit, Push

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add README**

Create `README.md` describing:

```md
# French Flashcards

Mobile-first French flashcard study site for GitHub Pages.

## Study Method

Use active recall: answer before revealing. Use the rating buttons honestly so missed cards return soon and easy cards wait longer.

## Local Use

Open `index.html` in a browser or run a simple local static server.

## Tests

Run `npm test`.

## GitHub Pages

Publish from the `main` branch root in repository settings. The site URL will be `https://david-eskoundos.github.io/FrenchFlashCards/` after Pages finishes publishing.
```

- [ ] **Step 2: Verify tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Verify page loads locally**

Run: `python -m http.server 8000`

Expected: local server serves `index.html`; inspect mobile width and desktop width in browser.

- [ ] **Step 4: Initialize git, commit, and push**

Run:

```bash
git init
git branch -M main
git remote add origin https://github.com/david-eskoundos/FrenchFlashCards.git
git add index.html styles.css app.js package.json tests/scheduler.test.js README.md .nojekyll docs/superpowers/specs/2026-06-21-flashcard-study-site-design.md docs/superpowers/plans/2026-06-21-flashcard-study-site.md
git commit -m "feat: add French flashcard study site"
git push -u origin main
```

Expected: push succeeds. If GitHub Pages is not enabled, enable Pages from `main` branch root in repository settings.

