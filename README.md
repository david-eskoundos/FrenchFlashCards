# French Flashcards

Mobile-first French flashcard study site for GitHub Pages.

## Built-In Deck

The site currently ships with 1,184 built-in flashcards. Cards show English on the front and French on the back so you practice producing French:

- A1: 300 cards
- A2: 532 cards
- B1 vocabulary: 206 cards
- B1 handnotes: 146 cards from visual transcription JSON, including 3 marked for review

## Study Method

Use active recall: answer before revealing. Use the rating buttons honestly so missed cards return soon and easy cards wait longer. Good flashcards are small and specific: one word, one expression, or one grammar decision per card.

## GitHub Sync

The app can save learning progress to a private GitHub Gist from the Data tab.

1. Create a GitHub fine-grained or classic token with permission to create/edit Gists.
2. Paste the token into `GitHub token`.
3. Leave `Gist ID` blank the first time and press `Sync now`; the app creates a private Gist and fills the ID.
4. Turn on `Auto-save learning to GitHub` and press `Save sync`.
5. On another browser or iPhone, paste the same token and Gist ID, then press `Load GitHub`.

The token is stored only in that browser's local storage. Do not use this on a shared device.

## Reset Learning

The `Reset learning` button keeps all flashcards but clears ratings, due dates, intervals, repetitions, and lapses so every card starts fresh.

## Local Use

Open `index.html` in a browser, or run a local static server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Tests and Verification

Run:

```bash
npm test
node tools/verify_seed_deck.js
```

The verification script checks card count, duplicate IDs, empty fronts/backs, level totals, and extraction report consistency.

## GitHub Pages

Publish from the `main` branch root in repository settings. The site URL will be:

```text
https://david-eskoundos.github.io/FrenchFlashCards/
```

GitHub Pages may take a few minutes to publish after a push.



