# Supabase Sync Setup

This site saves the full deck library to `localStorage` immediately. Supabase sync is optional and runs only after login.

## 1. Add frontend config

Open `app.js` and fill in these two public values:

```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

Use only the Project URL and anon public key from Supabase. Do not add service-role keys, GitHub tokens, or other secrets to the frontend.

## 2. Create the table and policies

Run this SQL in the Supabase SQL editor:

```sql
create table if not exists progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table progress enable row level security;

create policy "Users can read own progress"
on progress for select
using (auth.uid() = user_id);

create policy "Users can insert own progress"
on progress for insert
with check (auth.uid() = user_id);

create policy "Users can update own progress"
on progress for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 3. Enable auth

In Supabase, enable Email auth. Magic links are used by the site. Add your GitHub Pages URL to the allowed redirect URLs, for example:

```text
https://YOUR-GITHUB-USER.github.io/YOUR-REPO/
```

Also add any local test URL you use, such as `http://localhost:8000/`.

## 4. Test sync

1. Open the site and confirm it shows `Saved locally`.
2. Enter your email and click `Send magic link`.
3. Open the magic link in the same browser.
4. Review a card in any deck and wait 2 seconds for `Synced`.
5. Open the site on another device or browser, login with the same email, and confirm progress merges.
6. Turn off network, review a card, and confirm `Offline - saved locally`; reconnect and click `Sync now`.

## Progress migration

The attached backup has been copied to `progress/attached-progress.json`. On startup the app loads localStorage first, then merges bundled progress backups, then merges Supabase progress after login. Merging keeps all decks, reviewed cards, highest learning counters/ease, and newest timestamps before saving locally again. Old single-deck progress backups are migrated into the default deck.
