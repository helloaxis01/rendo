-- One-line recipe tagline; subtitle_manual preserves user edits
alter table public.recipes
  add column if not exists subtitle text;

alter table public.recipes
  add column if not exists subtitle_manual boolean not null default false;
