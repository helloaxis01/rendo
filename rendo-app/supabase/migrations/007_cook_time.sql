-- Extracted cook duration from vision / recipe sources
alter table public.recipes
  add column if not exists cook_time_minutes integer;
