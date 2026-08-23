export type ShoppingSource = {
  recipe_id: string;
  recipe_title: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
};

/** One measurable line on the app-wide shopping list. */
export type ShoppingItem = {
  id: string;
  /** Display name (first spelling we saw). */
  name: string;
  /** Normalized match key. */
  name_key: string;
  amount: number | null;
  unit: string | null;
  checked: boolean;
  sources: ShoppingSource[];
  created_at: string;
  updated_at: string;
};

export type ShoppingGroup = {
  name_key: string;
  name: string;
  items: ShoppingItem[];
};
