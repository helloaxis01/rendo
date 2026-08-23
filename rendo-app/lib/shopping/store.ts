import { getDb } from "@/lib/db";
import type { ShoppingItem } from "@/lib/shopping/types";
import {
  addContribution,
  isIngredientOnList,
  removeContribution,
  type ShoppingContribution,
} from "@/lib/shopping/merge";

async function readAll(): Promise<ShoppingItem[]> {
  const db = getDb();
  return db.shopping_items.orderBy("created_at").toArray();
}

async function writeAll(items: ShoppingItem[]) {
  const db = getDb();
  await db.transaction("rw", db.shopping_items, async () => {
    await db.shopping_items.clear();
    if (items.length) await db.shopping_items.bulkPut(items);
  });
}

export async function listShoppingItems(): Promise<ShoppingItem[]> {
  return readAll();
}

export async function addToShoppingList(
  contribution: ShoppingContribution
): Promise<ShoppingItem[]> {
  const next = addContribution(await readAll(), contribution);
  await writeAll(next);
  return next;
}

export async function removeFromShoppingList(
  recipeId: string,
  ingredientId: string
): Promise<ShoppingItem[]> {
  const next = removeContribution(await readAll(), recipeId, ingredientId);
  await writeAll(next);
  return next;
}

export async function toggleShoppingIngredient(
  contribution: ShoppingContribution,
  on: boolean
): Promise<ShoppingItem[]> {
  if (on) return addToShoppingList(contribution);
  return removeFromShoppingList(
    contribution.recipe_id,
    contribution.ingredient_id
  );
}

export async function setShoppingItemChecked(
  id: string,
  checked: boolean
): Promise<void> {
  const db = getDb();
  const item = await db.shopping_items.get(id);
  if (!item) return;
  await db.shopping_items.put({
    ...item,
    checked,
    updated_at: new Date().toISOString(),
  });
}

export async function clearCheckedShoppingItems(): Promise<ShoppingItem[]> {
  const next = (await readAll()).filter((item) => !item.checked);
  await writeAll(next);
  return next;
}

export async function clearShoppingList(): Promise<void> {
  await writeAll([]);
}

export async function shoppingListRecipeMap(
  recipeId: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const item of await readAll()) {
    for (const source of item.sources) {
      if (source.recipe_id === recipeId) ids.add(source.ingredient_id);
    }
  }
  return ids;
}

export async function ingredientOnShoppingList(
  recipeId: string,
  ingredientId: string
): Promise<boolean> {
  return isIngredientOnList(await readAll(), recipeId, ingredientId);
}
