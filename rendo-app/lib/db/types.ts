import { z } from "zod";

export const IngredientSchema = z.object({
  id: z.string(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  name: z.string(),
  search_key: z.string(),
  checked: z.boolean().optional().default(false),
});

export const StepSchema = z.object({
  step_number: z.number().int().positive(),
  action_header: z.string(),
  instruction: z.string(),
  timer_seconds: z.number().int().nonnegative().nullable().optional(),
});

export const KitchenNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  created_at: z.string(),
});

export const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  source_handle: z.string().nullable(),
  source_url: z.string().nullable(),
  prep_time_minutes: z.number().int().nonnegative(),
  servings_base: z.number().positive(),
  cover_image_url: z.string().nullable(),
  user_cover_image_url: z.string().nullable().optional(),
  cover_fallback_label: z.string().nullable().optional(),
  cover_display: z.enum(["photo", "type", "mine"]).optional(),
  is_favorite: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  ingredients_normalized: z.array(IngredientSchema).default([]),
  steps: z.array(StepSchema).default([]),
  kitchen_notes: z.array(KitchenNoteSchema).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  last_opened_at: z.string().nullable().optional(),
  times_cooked: z.number().int().nonnegative().optional().default(0),
});

export const ExtractedRecipeSchema = RecipeSchema.omit({
  created_at: true,
  updated_at: true,
  last_opened_at: true,
}).extend({
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const ExtractResponseSchema = z.object({
  recipes: z.array(ExtractedRecipeSchema).min(1),
});

export type Ingredient = z.infer<typeof IngredientSchema>;
export type RecipeStep = z.infer<typeof StepSchema>;
export type KitchenNote = z.infer<typeof KitchenNoteSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;

export type TagRecord = {
  id: string;
  name: string;
  count: number;
};

export type SyncMutation = {
  id: string;
  entity: "recipe" | "tag" | "preference";
  operation: "upsert" | "delete";
  payload: unknown;
  created_at: string;
  attempts: number;
};

export type LibraryView = "tiles" | "list";
export type LibrarySort =
  | "recently_added"
  | "title"
  | "prep_time"
  | "most_cooked";

export type Preferences = {
  id: "app";
  theme: "light" | "dark";
  unit_system: "imperial" | "metric";
  library_view: LibraryView;
  library_sort: LibrarySort;
  /** Stable tag pill order after fixed pills (All / Favorites / Recent). New tags append. */
  filter_pill_order?: string[];
};
