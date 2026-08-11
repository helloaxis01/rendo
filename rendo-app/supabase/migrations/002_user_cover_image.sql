-- User-uploaded cover photos (local "Upload Photo" mode)
alter table public.recipes
  add column if not exists user_cover_image_url text;
