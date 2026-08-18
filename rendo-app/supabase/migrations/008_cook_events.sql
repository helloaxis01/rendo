-- Per-cook memory log (occasion / who / note), stored on the recipe row
alter table public.recipes
  add column if not exists cook_events jsonb not null default '[]'::jsonb;
