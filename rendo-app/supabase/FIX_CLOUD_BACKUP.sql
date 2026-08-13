-- Run in Supabase SQL Editor if cloud sync errors on missing columns.
-- Safe to re-run.

alter table public.recipes
  add column if not exists user_cover_image_url text;

alter table public.recipes
  add column if not exists cover_image_position text;

alter table public.recipes
  add column if not exists user_cover_image_position text;

alter table public.recipes
  add column if not exists times_cooked integer not null default 0;

alter table public.recipes
  add column if not exists cooked boolean not null default false;

alter table public.recipes
  add column if not exists rating smallint
  check (rating is null or (rating >= 1 and rating <= 5));

notify pgrst, 'reload schema';
