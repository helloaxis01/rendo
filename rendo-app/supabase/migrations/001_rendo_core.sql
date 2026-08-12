-- RENDO core schema: local-first vault sync target
-- Apply via Supabase SQL editor or `supabase db push`

create extension if not exists "pgcrypto";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Household vaults (shared collection for spouses / family)
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.recipes (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  title text not null,
  source_handle text,
  source_url text,
  prep_time_minutes integer not null default 0,
  servings_base numeric not null default 4,
  cover_image_url text,
  cover_fallback_label text,
  cover_display text not null default 'photo' check (cover_display in ('photo', 'type', 'mine')),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz
);

create table if not exists public.recipe_ingredients (
  id text primary key,
  recipe_id text not null references public.recipes (id) on delete cascade,
  amount numeric,
  unit text,
  name text not null,
  search_key text not null,
  checked boolean not null default false,
  position integer not null default 0
);

create table if not exists public.recipe_steps (
  id text primary key,
  recipe_id text not null references public.recipes (id) on delete cascade,
  step_number integer not null,
  action_header text not null,
  instruction text not null,
  timer_seconds integer,
  unique (recipe_id, step_number)
);

create table if not exists public.recipe_tags (
  recipe_id text not null references public.recipes (id) on delete cascade,
  tag text not null,
  primary key (recipe_id, tag)
);

create table if not exists public.kitchen_notes (
  id text primary key,
  recipe_id text not null references public.recipes (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists recipes_user_id_idx on public.recipes (user_id);
create index if not exists recipes_household_id_idx on public.recipes (household_id);
create index if not exists recipe_tags_tag_idx on public.recipe_tags (tag);

-- Helpers for RLS
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_recipe(rid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recipes r
    where r.id = rid
      and (
        r.user_id = auth.uid()
        or (r.household_id is not null and public.is_household_member(r.household_id))
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.kitchen_notes enable row level security;

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Households
drop policy if exists "households_select_member" on public.households;
create policy "households_select_member" on public.households
  for select using (public.is_household_member(id) or created_by = auth.uid());
drop policy if exists "households_insert_owner" on public.households;
create policy "households_insert_owner" on public.households
  for insert with check (created_by = auth.uid());
drop policy if exists "households_update_member" on public.households;
create policy "households_update_member" on public.households
  for update using (public.is_household_member(id));

drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id));
drop policy if exists "household_members_insert" on public.household_members;
create policy "household_members_insert" on public.household_members
  for insert with check (user_id = auth.uid() or public.is_household_member(household_id));

-- Recipes: private vault OR household vault
drop policy if exists "recipes_select" on public.recipes;
create policy "recipes_select" on public.recipes
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
drop policy if exists "recipes_insert" on public.recipes;
create policy "recipes_insert" on public.recipes
  for insert with check (
    user_id = auth.uid()
    and (
      household_id is null
      or public.is_household_member(household_id)
    )
  );
drop policy if exists "recipes_update" on public.recipes;
create policy "recipes_update" on public.recipes
  for update using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
drop policy if exists "recipes_delete" on public.recipes;
create policy "recipes_delete" on public.recipes
  for delete using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

-- Child tables inherit access via recipe ownership
drop policy if exists "ingredients_all" on public.recipe_ingredients;
create policy "ingredients_all" on public.recipe_ingredients
  for all using (public.can_access_recipe(recipe_id))
  with check (public.can_access_recipe(recipe_id));
drop policy if exists "steps_all" on public.recipe_steps;
create policy "steps_all" on public.recipe_steps
  for all using (public.can_access_recipe(recipe_id))
  with check (public.can_access_recipe(recipe_id));
drop policy if exists "tags_all" on public.recipe_tags;
create policy "tags_all" on public.recipe_tags
  for all using (public.can_access_recipe(recipe_id))
  with check (public.can_access_recipe(recipe_id));
drop policy if exists "notes_all" on public.kitchen_notes;
create policy "notes_all" on public.kitchen_notes
  for all using (public.can_access_recipe(recipe_id))
  with check (public.can_access_recipe(recipe_id));

-- Storage: recipe-media/{user_id}/{recipe_id}.jpg
insert into storage.buckets (id, name, public)
values ('recipe-media', 'recipe-media', true)
on conflict (id) do nothing;

drop policy if exists "recipe_media_select" on storage.objects;
create policy "recipe_media_select" on storage.objects
  for select using (bucket_id = 'recipe-media');

drop policy if exists "recipe_media_insert" on storage.objects;
create policy "recipe_media_insert" on storage.objects
  for insert with check (
    bucket_id = 'recipe-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "recipe_media_update" on storage.objects;
create policy "recipe_media_update" on storage.objects
  for update using (
    bucket_id = 'recipe-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "recipe_media_delete" on storage.objects;
create policy "recipe_media_delete" on storage.objects
  for delete using (
    bucket_id = 'recipe-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
