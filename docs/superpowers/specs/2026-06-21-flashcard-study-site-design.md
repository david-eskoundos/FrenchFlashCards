# French Flashcard Study Site Design

## Goal

Create a simple French flashcard website hosted from `david-eskoundos/FrenchFlashCards.git` with GitHub Pages. The first version lets the learner create and study their own cards on iPhone first and Windows second.

## Learning Model

The study flow uses active recall and spaced repetition:

- Show the prompt before the answer so the learner must retrieve from memory.
- Reveal the answer only after the learner attempts recall.
- Ask for a self-rating: Again, Hard, Good, or Easy.
- Reschedule cards with expanding intervals: missed cards return soon, confident cards wait longer.
- Keep prompts atomic: one card should test one vocabulary item, grammar cue, or short production task.

The scheduler will be lightweight rather than a full Anki clone. It will track `dueAt`, `intervalDays`, `ease`, `repetitions`, and `lapses` per card.

## Product Scope

First version:

- Mobile-first study screen.
- Add-card form with front, back, notes, tags, and direction.
- Study queue showing due cards first and then new cards.
- Four rating buttons after answer reveal.
- Deck list with search and edit/delete actions.
- Progress summary: due, new, learning, and total cards.
- Import/export JSON for moving cards between iPhone and Windows.
- Local browser storage for cards and progress.
- GitHub Pages-ready static files.

Out of scope for this version:

- User accounts.
- Cloud sync across devices.
- Automatic extraction from the French PDFs, DOCX files, PPTX, or spreadsheet.
- Audio pronunciation.
- Multiple named decks.

## Architecture

Use static HTML, CSS, and JavaScript so GitHub Pages can publish directly from the repository. Keep scheduler and storage logic in focused JavaScript functions so they can be tested without a browser UI.

Files:

- `index.html`: app shell and semantic controls.
- `styles.css`: responsive mobile-first layout and interaction states.
- `app.js`: UI state, local storage, scheduling, import/export, and rendering.
- `tests/scheduler.test.js`: Node-based tests for core scheduling and queue logic.
- `.nojekyll`: disables Jekyll processing for direct static serving.
- `README.md`: setup, GitHub Pages, and study-method notes.

## UI Design

The first viewport is the active study interface, not a landing page. On iPhone, it uses one main column: top status bar, flashcard, reveal/rating controls, then compact tabs for Add, Browse, and Data. On wider screens, the card and management panel can sit side by side.

The visual style should feel calm and practical: high contrast, large tap targets, stable card dimensions, no decorative hero section, and no login prompts.

## Data Flow

Cards are stored in `localStorage` under a versioned key. On load, the app reads stored cards; if none exist, it shows an empty study state and the add-card form. When a card is rated, the scheduler computes the next interval and due date, updates the card, saves the full deck, and advances the queue.

Import replaces or merges cards from JSON after validation. Export downloads a JSON file containing the deck and app version.

## Error Handling

- Required card fields are validated before save.
- Invalid import JSON shows a clear error and does not overwrite existing cards.
- Empty study queues show a useful next step.
- Deleting a card asks for confirmation.
- Storage failures show a short visible message.

## Testing

Automated tests cover scheduler behavior, due-card ordering, new-card inclusion, and import validation. Manual verification covers iPhone-sized and desktop-sized layouts, card creation, study rating, refresh persistence, import, and export.

