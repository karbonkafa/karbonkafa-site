-- Phase B (gamification) — opt-in identity title on the profile.
-- Stores the title id the user chose to display (see src/lib/titles.ts).
-- null = no title shown. Safe to re-run.

alter table profiles add column if not exists display_title text;
