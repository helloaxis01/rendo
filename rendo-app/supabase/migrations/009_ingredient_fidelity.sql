-- Additive ingredient fidelity fields for Vision / OCR imports
alter table public.recipe_ingredients
  add column if not exists raw_text text,
  add column if not exists preparation_notes text,
  add column if not exists confidence_score numeric,
  add column if not exists section text;

notify pgrst, 'reload schema';
