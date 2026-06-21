# French Flashcards

Mobile-first French flashcard study site for GitHub Pages.

## Built-In Deck

The site currently ships with 1,038 vocabulary flashcards extracted from `French_Vocab_Grouped_A1_A2_B1 (1).xlsx`:

- A1: 300 cards
- A2: 532 cards
- B1: 206 cards

The `B1 handnotes.pdf` file was inspected, but its useful notes are image-based. The PDF text layer only exposes page labels/dates and a few headings, so it needs OCR or manual transcription before it can become reliable flashcards.

## Study Method

Use active recall: answer before revealing. Use the rating buttons honestly so missed cards return soon and easy cards wait longer. Good flashcards are small and specific: one word, one expression, or one grammar decision per card.

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
