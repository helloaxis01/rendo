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
  add column if not exists last_cooked_at timestamptz;

alter table public.recipes
  add column if not exists rating smallint
  check (rating is null or (rating >= 1 and rating <= 5));

alter table public.recipes
  add column if not exists subtitle text;

alter table public.recipes
  add column if not exists subtitle_manual boolean not null default false;

alter table public.recipes
  add column if not exists cook_time_minutes integer;

alter table public.recipes
  add column if not exists cook_events jsonb not null default '[]'::jsonb;

-- Ingredient section headers + fidelity (Slice 3 / Slice 6 round-trip)
alter table public.recipe_ingredients
  add column if not exists raw_text text,
  add column if not exists preparation_notes text,
  add column if not exists confidence_score numeric,
  add column if not exists section text;

notify pgrst, 'reload schema';
