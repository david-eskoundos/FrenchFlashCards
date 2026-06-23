create table if not exists public.flashcard_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app text not null default 'FrenchFlashCards',
  progress jsonb not null,
  seed_deck_version integer not null default 0,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flashcard_progress enable row level security;

drop policy if exists "Users can read their own flashcard progress" on public.flashcard_progress;
create policy "Users can read their own flashcard progress"
on public.flashcard_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own flashcard progress" on public.flashcard_progress;
create policy "Users can insert their own flashcard progress"
on public.flashcard_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own flashcard progress" on public.flashcard_progress;
create policy "Users can update their own flashcard progress"
on public.flashcard_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
