-- Cooked flag + 1–5 flame rating for recipes
alter table public.recipes
  add column if not exists cooked boolean not null default false;

alter table public.recipes
  add column if not exists rating smallint
  check (rating is null or (rating >= 1 and rating <= 5));
