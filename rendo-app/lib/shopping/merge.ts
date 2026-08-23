import { normalizeIngredientName } from "@/lib/shopping/normalize";
import type {
  ShoppingGroup,
  ShoppingItem,
  ShoppingSource,
} from "@/lib/shopping/types";
import { combineAmounts, unitsCompatible } from "@/lib/shopping/units";

export type ShoppingContribution = {
  name: string;
  amount: number | null;
  unit: string | null;
  recipe_id: string;
  recipe_title: string;
  ingredient_id: string;
};

function recomputeFromSources(sources: ShoppingSource[]): {
  amount: number | null;
  unit: string | null;
} {
  if (!sources.length) return { amount: null, unit: null };
  let amount = sources[0].amount;
  let unit = sources[0].unit;
  for (let i = 1; i < sources.length; i += 1) {
    const next = combineAmounts(
      amount,
      unit,
      sources[i].amount,
      sources[i].unit
    );
    if (!next) {
      return { amount: sources[0].amount, unit: sources[0].unit };
    }
    amount = next.amount;
    unit = next.unit;
  }
  return { amount, unit };
}

function newId() {
  return `shop_${crypto.randomUUID()}`;
}

/**
 * Add a recipe ingredient to the shopping list.
 * Same normalized name + compatible units → one line (amounts summed).
 * Same name, incompatible units → separate lines, grouped by name in the UI.
 * Recipe ingredient lists stay unmerged; this is shopping-list only.
 */
export function addContribution(
  items: ShoppingItem[],
  contribution: ShoppingContribution,
  now = new Date().toISOString()
): ShoppingItem[] {
  const name_key = normalizeIngredientName(contribution.name);
  if (!name_key) return items;

  const source: ShoppingSource = {
    recipe_id: contribution.recipe_id,
    recipe_title: contribution.recipe_title,
    ingredient_id: contribution.ingredient_id,
    amount: contribution.amount,
    unit: contribution.unit,
  };

  const alreadyTracked = items.some((item) =>
    item.sources.some(
      (s) =>
        s.recipe_id === source.recipe_id &&
        s.ingredient_id === source.ingredient_id
    )
  );
  if (alreadyTracked) return items;

  const mergeIdx = items.findIndex(
    (item) =>
      item.name_key === name_key &&
      unitsCompatible(item.unit, contribution.unit)
  );

  if (mergeIdx >= 0) {
    return items.map((item, index) => {
      if (index !== mergeIdx) return item;
      const sources = [...item.sources, source];
      const { amount, unit } = recomputeFromSources(sources);
      return {
        ...item,
        amount,
        unit,
        sources,
        updated_at: now,
      };
    });
  }

  return [
    ...items,
    {
      id: newId(),
      name: contribution.name.trim() || name_key,
      name_key,
      amount: contribution.amount,
      unit: contribution.unit,
      checked: false,
      sources: [source],
      created_at: now,
      updated_at: now,
    },
  ];
}

export function removeContribution(
  items: ShoppingItem[],
  recipeId: string,
  ingredientId: string,
  now = new Date().toISOString()
): ShoppingItem[] {
  const next: ShoppingItem[] = [];
  for (const item of items) {
    const sources = item.sources.filter(
      (s) =>
        !(s.recipe_id === recipeId && s.ingredient_id === ingredientId)
    );
    if (!sources.length) continue;
    if (sources.length === item.sources.length) {
      next.push(item);
      continue;
    }
    const { amount, unit } = recomputeFromSources(sources);
    next.push({
      ...item,
      amount,
      unit,
      sources,
      updated_at: now,
    });
  }
  return next;
}

export function isIngredientOnList(
  items: ShoppingItem[],
  recipeId: string,
  ingredientId: string
): boolean {
  return items.some((item) =>
    item.sources.some(
      (s) => s.recipe_id === recipeId && s.ingredient_id === ingredientId
    )
  );
}

/** Group lines that share a name but couldn't combine units. */
export function groupShoppingItems(items: ShoppingItem[]): ShoppingGroup[] {
  const order: string[] = [];
  const map = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const list = map.get(item.name_key);
    if (list) list.push(item);
    else {
      map.set(item.name_key, [item]);
      order.push(item.name_key);
    }
  }
  return order.map((name_key) => {
    const groupItems = map.get(name_key)!;
    return {
      name_key,
      name: groupItems[0].name,
      items: groupItems,
    };
  });
}
