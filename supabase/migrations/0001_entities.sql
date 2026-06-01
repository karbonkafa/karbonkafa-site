-- Phase A — unified catalog + light logging + minimal social
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / drop-and-create policies).

create extension if not exists pg_trgm;

-- 1) Polymorphic catalog: every media item normalized into one row
create table if not exists entities (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('game','movie','tv','album','book')),
  source     text not null,              -- igdb | karbon | tmdb | musicbrainz | openlibrary
  source_id  text not null,
  slug       text not null,
  title      text not null,
  image_url  text,
  year       int,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists entities_type_idx  on entities (type);
create index if not exists entities_title_trgm on entities using gin (title gin_trgm_ops);

-- 2) Existing lists keep working; items now point at an entity.
--    game_slug stays during migration; new items use entity_id.
alter table list_items add column if not exists entity_id uuid references entities(id);
create index if not exists list_items_entity_idx on list_items (entity_id);
-- New items use entity_id; legacy game_slug stays but is no longer required.
alter table list_items alter column game_slug drop not null;

-- 3) Light logging: one entry per (user, entity) — status + rating + note
create table if not exists entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  entity_id  uuid not null references entities(id) on delete cascade,
  status     text check (status in ('want','active','done','dropped')),
  rating     int  check (rating between 1 and 10),
  note       text,
  logged_at  timestamptz not null default now(),
  unique (user_id, entity_id)
);

create index if not exists entries_user_idx   on entries (user_id);
create index if not exists entries_entity_idx on entries (entity_id);

-- 4) Minimal social: likes on lists
create table if not exists list_likes (
  user_id    uuid references profiles(id) on delete cascade,
  list_id    uuid references lists(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, list_id)
);

create index if not exists list_likes_list_idx on list_likes (list_id);

-- ── Row Level Security ──────────────────────────────────────────────
alter table entities   enable row level security;
alter table entries    enable row level security;
alter table list_likes enable row level security;

-- entities: anyone can read; any authenticated user can add to the catalog
drop policy if exists "entities read"   on entities;
drop policy if exists "entities insert" on entities;
create policy "entities read"   on entities for select using (true);
create policy "entities insert" on entities for insert with check (auth.uid() is not null);

-- entries: public read (for profile libraries); owner writes
drop policy if exists "entries read"  on entries;
drop policy if exists "entries write" on entries;
create policy "entries read"  on entries for select using (true);
create policy "entries write" on entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- list_likes: public read (counts); owner writes
drop policy if exists "list_likes read"  on list_likes;
drop policy if exists "list_likes write" on list_likes;
create policy "list_likes read"  on list_likes for select using (true);
create policy "list_likes write" on list_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
