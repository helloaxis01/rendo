-- FIX CLOUD BACKUP — paste ONLY this into Supabase SQL Editor, then click Run.
-- Do NOT paste 001_rendo_core.sql (that causes the "policy already exists" error).

alter table public.recipes
  add column if not exists user_cover_image_url text;

alter table public.recipes
  add column if not exists cover_image_position text;

alter table public.recipes
  add column if not exists user_cover_image_position text;

alter table public.recipes
  add column if not exists times_cooked integer not null default 0;

notify pgrst, 'reload schema';
