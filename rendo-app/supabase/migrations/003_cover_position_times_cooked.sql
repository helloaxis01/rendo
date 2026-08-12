-- Optional cover framing + cook count columns for cloud sync
alter table public.recipes
  add column if not exists cover_image_position text;

alter table public.recipes
  add column if not exists user_cover_image_position text;

alter table public.recipes
  add column if not exists times_cooked integer not null default 0;
