-- Add optional room-level guest assignment notes for lodge confirmations.
-- Safe to run more than once.

alter table public.lodge_confirms
  add column if not exists guest_assignment text;

comment on column public.lodge_confirms.guest_assignment is
  'Optional guest/room assignment memo, e.g. male students 8 / teachers 2.';

-- Verification query:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'lodge_confirms'
--   and column_name = 'guest_assignment';
