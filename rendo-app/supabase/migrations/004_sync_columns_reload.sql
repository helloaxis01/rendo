-- Run in Supabase → SQL Editor → New query → Run
-- Adds columns required for full cloud backup (covers + cook count)

alter table public.recipes
  add column if not exists user_cover_image_url text;

alter table public.recipes
  add column if not exists cover_image_position text;

alter table public.recipes
  add column if not exists user_cover_image_position text;

alter table public.recipes
  add column if not exists times_cooked integer not null default 0;

-- Refresh PostgREST schema cache so API stops complaining about missing columns
notify pgrst, 'reload schema';
