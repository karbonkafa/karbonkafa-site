-- Phase B (gamification) — diary/replay logs, separate from `entries`.
-- `entries` stays the library/status table: one row per (user, entity) with the
-- *current* status + rating, used by EntityActions upsert and the profile library.
-- `logs` is the Letterboxd/Backloggd-style diary: MANY rows per (user, entity),
-- one per play/watch/read session. Re-consumption is additive and never punished;
-- the first rating in `entries` is preserved. Safe to re-run.

create table if not exists logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  entity_id   uuid not null references entities(id) on delete cascade,
  rating      int  check (rating between 1 and 10),
  note        text,
  is_replay   boolean not null default false,   -- false = first time, true = rewind
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists logs_user_idx          on logs (user_id);
create index if not exists logs_entity_idx         on logs (entity_id);
create index if not exists logs_user_entity_idx    on logs (user_id, entity_id);

-- "Nostalji Katsayısı" source: replay count per (user, entity) is just
--   select count(*) from logs where user_id = ? and entity_id = ? and is_replay
-- (derive on read; no denormalized counter to keep consistent).

-- ── Row Level Security ──────────────────────────────────────────────
alter table logs enable row level security;

-- Public read (profile diaries are public, like the library); owner writes.
drop policy if exists "logs read"  on logs;
drop policy if exists "logs write" on logs;
create policy "logs read"  on logs for select using (true);
create policy "logs write" on logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
