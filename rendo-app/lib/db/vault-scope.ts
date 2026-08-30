import {
  isSeedRecipeId,
  rebuildTagsFromRecipes,
  SEED_RECIPE_IDS,
} from "@/data/seed-recipes";
import { getDb } from "@/lib/db";
import {
  clearRecipeVault,
  listRecipes,
  notifyVaultChanged,
} from "@/lib/db/queries";
import { clearDeletedRecipeTombstones } from "@/lib/db/deleted";
import {
  hydrateCloudSyncStatusForUser,
  resetCloudSyncStatusForUser,
} from "@/lib/db/sync-status";
import type { Recipe, SyncMutation } from "@/lib/db/types";

const VAULT_OWNER_KEY = "rendo_vault_owner_v1";

export type VaultScopeResult =
  | "unchanged"
  | "first_sign_in"
  | "account_switch";

export type VaultOwner = "local" | string;

export function getStoredVaultOwner(): VaultOwner | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VAULT_OWNER_KEY);
    if (!raw) return null;
    return raw === "local" ? "local" : raw;
  } catch {
    return null;
  }
}

export function setStoredVaultOwner(owner: VaultOwner) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VAULT_OWNER_KEY, owner);
  } catch {
    // ignore quota
  }
}

async function purgeSeedRecipesAndMutations() {
  const db = getDb();
  await db.recipes.bulkDelete([...SEED_RECIPE_IDS]);

  const pending = await db.sync_queue.where("entity").equals("recipe").toArray();
  const seedMutations = pending.filter((mutation) => {
    const id =
      mutation.operation === "delete"
        ? String((mutation.payload as { id?: string } | null)?.id ?? "")
        : String((mutation.payload as Recipe | null)?.id ?? "");
    return isSeedRecipeId(id);
  });
  if (seedMutations.length) {
    await db.sync_queue.bulkDelete(seedMutations.map((mutation) => mutation.id));
  }

  const recipes = await listRecipes();
  await db.tags.clear();
  if (recipes.length) {
    await db.tags.bulkPut(rebuildTagsFromRecipes(recipes));
  }
}

let scopedUserId: string | null = null;
let scopePromise: Promise<VaultScopeResult> | null = null;

/**
 * Bind the local recipe vault to the signed-in Supabase user.
 * - First sign-in: drop demo seeds, keep user-created local recipes.
 * - Account switch: wipe local recipes and reload from the new account.
 */
export async function ensureVaultScopedToUser(
  userId: string
): Promise<VaultScopeResult> {
  if (scopedUserId === userId && scopePromise) {
    return scopePromise;
  }

  scopePromise = (async () => {
    const owner = getStoredVaultOwner();

    if (owner === userId) {
      hydrateCloudSyncStatusForUser(userId);
      scopedUserId = userId;
      return "unchanged";
    }

    if (!owner || owner === "local") {
      await purgeSeedRecipesAndMutations();
      setStoredVaultOwner(userId);
      hydrateCloudSyncStatusForUser(userId);
      notifyVaultChanged();
      scopedUserId = userId;
      return "first_sign_in";
    }

    await clearRecipeVault();
    clearDeletedRecipeTombstones();
    setStoredVaultOwner(userId);
    resetCloudSyncStatusForUser(userId);
    notifyVaultChanged();
    scopedUserId = userId;
    return "account_switch";
  })();

  try {
    return await scopePromise;
  } finally {
    scopePromise = null;
  }
}

export function resetVaultScopeCache() {
  scopedUserId = null;
  scopePromise = null;
}

/** Recipes eligible for cloud push — excludes demo seeds. */
export function recipesForCloudPush(recipes: Recipe[]): Recipe[] {
  return recipes.filter((recipe) => !isSeedRecipeId(recipe.id));
}

export function mutationIsSeedRecipe(mutation: SyncMutation): boolean {
  if (mutation.entity !== "recipe") return false;
  const id =
    mutation.operation === "delete"
      ? String((mutation.payload as { id?: string } | null)?.id ?? "")
      : String((mutation.payload as Recipe | null)?.id ?? "");
  return isSeedRecipeId(id);
}
