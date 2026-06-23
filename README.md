# French Flashcards

A mobile-first French flashcard website for studying vocabulary and grammar with spaced repetition. It is designed mainly for iPhone, with Windows/desktop support as a secondary use case.

Live site: https://david-eskoundos.github.io/FrenchFlashCards/

Repository: https://github.com/david-eskoundos/FrenchFlashCards

## What It Does

- Shows flashcards with English on the front and French on the back.
- Uses active recall: think of the answer first, then reveal it.
- Schedules cards with `Again`, `Hard`, `Good`, and `Easy` ratings.
- Reads French aloud with the browser speech voice.
- Spells the French answer slowly with the `Spell` button.
- Saves progress locally in the browser.
- Can sync learning progress through Supabase email magic-link auth.
- Works as a static GitHub Pages site; Supabase is optional for cross-device sync.

## Current Deck

The built-in deck currently has `1,184` flashcards:

| Source | Cards |
| --- | ---: |
| A1 vocabulary | 300 |
| A2 vocabulary | 532 |
| B1 vocabulary | 206 |
| B1 handnotes | 146 |

The B1 handnotes were imported from a visual transcription JSON file. Three of those handnote cards are marked for review.

## How To Study

1. Read the English prompt.
2. Try to say or write the French answer before revealing.
3. Press `Reveal`.
4. Use the rating buttons honestly:
   - `Again`: you missed it; it comes back soon.
   - `Hard`: correct, but difficult.
   - `Good`: correct with normal effort.
   - `Easy`: correct immediately.
5. Use `Listen` for pronunciation.
6. Use `Spell` when you want the exact French spelling.

## Saving And Backups

The app saves progress automatically in the current browser with `localStorage` before any cloud request. On the same iPhone/browser, you can close the page and come back later.

For cross-device progress, configure Supabase in the `Data` tab:

1. Create a Supabase project.
2. Run `docs/supabase-setup.sql` in the Supabase SQL editor.
3. Enable email magic links in Supabase Auth.
4. Add `https://david-eskoundos.github.io/FrenchFlashCards/` as an allowed redirect URL.
5. The app is prefilled for David's Supabase project; paste different Supabase values only if you change projects.
6. Enter your email and press `Send magic link`.

After sign-in, `Sync now` uploads this device's progress and `Load cloud` restores newer cloud progress. Auto sync uploads changes after ratings, imports, card edits, and resets.

Use the `Data` tab for manual backups:

- `Export JSON` downloads a timestamped backup file, for example `french-flashcards-2026-06-22T20-15-30-123Z.json`.
- `Copy backup` shows the same JSON on screen and tries to copy it to the clipboard.
- `Import JSON` restores cards/progress from a backup.
- `Reset learning` clears scheduling progress but keeps the cards.

For best safety, export a JSON backup after each study session or whenever you have made important progress.

## Working On Another Laptop Or Codex

Clone the repo:

```bash
git clone https://github.com/david-eskoundos/FrenchFlashCards.git
cd FrenchFlashCards
```

Run the site locally:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

No build step is required. This is a static HTML/CSS/JavaScript app.

## Important Files

| Path | Purpose |
| --- | --- |
| `index.html` | Main page structure. |
| `styles.css` | Mobile-first UI styles. |
| `app.js` | Flashcard app, scheduler, local save, timestamped JSON export, audio, spelling, browse pagination. |
| `data/seed-cards.json` | Generated built-in deck used by the website. |
| `data/flashcard-extraction-report.json` | Verification/report metadata for the generated deck. |
| `data/b1-handnotes-source.json` | Source JSON for the 146 B1 handnote cards. |
| `docs/supabase-setup.sql` | Supabase table and Row Level Security setup for cloud progress. |
| `progress/david-progress.json` | Latest repo reference progress backup. The app no longer updates it automatically. |
| `tools/generate_seed_cards.py` | Regenerates the built-in deck from source materials. |
| `tools/verify_seed_deck.js` | Validates counts, IDs, direction, and required card fields. |
| `tests/scheduler.test.js` | Node tests for scheduler, import/sync helpers, spelling, and deck integrity. |

## Regenerating The Deck

Use this after changing source material or card generation rules:

```bash
python tools/generate_seed_cards.py
node tools/verify_seed_deck.js
npm test
```

Expected current verification numbers:

- Total cards: `1,184`
- Spreadsheet cards: `1,038`
- B1 handnote cards: `146`
- Direction: `en-fr`
- Invalid cards: `0`

## Verification Before Pushing

Run:

```bash
npm test
node tools/verify_seed_deck.js
```

For a local website check:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` on desktop or mobile-sized browser tools.

## Publishing

The website is published by GitHub Pages from the `main` branch root.

Normal publish flow:

```bash
git status
git add README.md app.js index.html styles.css data tools tests
git commit -m "describe the change"
git push origin main
```

After pushing, GitHub Pages may take a minute or two to update.

Live URL:

```text
https://david-eskoundos.github.io/FrenchFlashCards/
```

## Notes For Future Codex Work

- Keep the app static and GitHub Pages friendly.
- Prefer small, simple UI changes because the main target is iPhone.
- Preserve English front / French back unless the user asks otherwise.
- When adding many cards, update the source file, regenerate `data/seed-cards.json`, update the verification report, and run tests.
- If changing the built-in deck, bump `SEED_DECK_VERSION` in `app.js` so existing browsers receive the new cards.
- Do not remove user learning progress during deck updates; built-in card text can update while scheduling state is preserved.


