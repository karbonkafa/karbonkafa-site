-- Phase B follow-up — allow music tracks (recordings) as a distinct entity type.
-- The 0001 table created an inline CHECK that doesn't include 'track'; re-running
-- 0001 won't update it (create table if not exists), so alter the constraint here.
-- Safe to re-run.

alter table entities drop constraint if exists entities_type_check;
alter table entities add constraint entities_type_check
  check (type in ('game','movie','tv','album','track','book'));
