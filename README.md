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
- Can save David's learning progress automatically to `progress/david-progress.json` in this repo.
- Works as a static GitHub Pages site: no server or database is required.

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

## Sync And Saving

The app always saves progress in the current browser with `localStorage`. On the same iPhone/browser, you can close the page and come back later.

For backup across devices, the app can also save David's progress directly into this public repo file:

```text
progress/david-progress.json
```

This file is intentionally named with `david` so more users can be added later with their own files, for example `progress/another-user-progress.json`.

### First-Time Repo Sync

1. Create a GitHub fine-grained token for this repository.
2. Paste it into `GitHub token` in the app's `Data` tab.
3. Check `Auto-save learning to my repo`.
4. Press `Save sync` so this browser remembers the token and auto-save setting.
5. Press `Sync now` once to write the first real progress backup to `progress/david-progress.json`.

### Normal Daily Use

- If `Auto-save learning to my repo` is checked, you do not need to press `Sync now` every time.
- Press `Sync now` manually when you want an immediate repo backup.
- Press `Load repo` only on a new browser, phone, laptop, or after clearing browser data.
- Keep `Reset learning` for the rare case where you want every card to start fresh again.

The GitHub token is stored only in that browser's local storage. Do not use it on a shared device. Because this repository is public, the progress file is also public.

### Fine-Grained Token Steps

1. Open GitHub, then go to `Settings` -> `Developer settings` -> `Personal access tokens` -> `Fine-grained tokens`.
2. Choose `Generate new token`.
3. Name it something like `FrenchFlashCards iPhone`.
4. Set an expiration you are comfortable with, for example 90 days or 1 year.
5. Under repository access, choose `Only select repositories`.
6. Select `david-eskoundos/FrenchFlashCards`.
7. Under repository permissions, set `Contents` to `Read and write`.
8. Leave everything else as `No access` unless GitHub requires metadata read access automatically.
9. Generate the token and copy it immediately.
10. Paste it into the app's `GitHub token` field, check auto-save, then press `Save sync` and `Sync now`.
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
| `app.js` | Flashcard app, scheduler, local save, GitHub repo sync, audio, spelling, browse pagination. |
| `data/seed-cards.json` | Generated built-in deck used by the website. |
| `data/flashcard-extraction-report.json` | Verification/report metadata for the generated deck. |
| `data/b1-handnotes-source.json` | Source JSON for the 146 B1 handnote cards. |
| `progress/david-progress.json` | David's repo-backed learning progress file. The app updates this through the GitHub API. |
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
