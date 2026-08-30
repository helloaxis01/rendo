const STORAGE_KEY = "rendo_deleted_recipes_v1";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

export function rememberDeletedRecipe(id: string) {
  const map = readMap();
  map[id] = new Date().toISOString();
  writeMap(map);
}

export function getDeletedRecipeIds(): Set<string> {
  return new Set(Object.keys(readMap()));
}

export async function getPendingDeletedRecipeIds(): Promise<Set<string>> {
  const { getPendingMutations } = await import("@/lib/db/queries");
  const pending = await getPendingMutations();
  const ids = new Set(getDeletedRecipeIds());
  for (const mutation of pending) {
    if (mutation.entity !== "recipe" || mutation.operation !== "delete") continue;
    const id = (mutation.payload as { id?: string } | null)?.id;
    if (id) ids.add(id);
  }
  return ids;
}

export function clearDeletedRecipeTombstones() {
  writeMap({});
}
