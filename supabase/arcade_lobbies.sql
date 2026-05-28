create table if not exists public.arcade_lobbies (
  code text primary key,
  game text not null check (game in ('tic-tac-toe', 'memory', 'hangman')),
  lobby jsonb not null,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  waiting_expires_at_ms bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists arcade_lobbies_game_idx
  on public.arcade_lobbies (game);

create index if not exists arcade_lobbies_updated_at_ms_idx
  on public.arcade_lobbies (updated_at_ms);

create index if not exists arcade_lobbies_waiting_expires_at_ms_idx
  on public.arcade_lobbies (waiting_expires_at_ms);

alter table public.arcade_lobbies enable row level security;

drop policy if exists "Public arcade lobbies can be managed"
  on public.arcade_lobbies;

create policy "Public arcade lobbies can be managed"
  on public.arcade_lobbies
  for all
  to anon, authenticated
  using (true)
  with check (true);
