import type { Recipe } from "@/lib/db/types";
import { getPreferences, listRecipes, setPreferences } from "@/lib/db/queries";
import { backfillCookEvents } from "@/lib/db/cook-events";

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Merge names case-insensitively; keep the first casing seen. */
export function mergeCookWhoNames(
  existing: string[],
  incoming: string[]
): string[] {
  const byKey = new Map<string, string>();
  for (const name of existing) {
    const cleaned = cleanName(name);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, cleaned);
  }
  for (const name of incoming) {
    const cleaned = cleanName(name);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, cleaned);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

function namesFromRecipes(recipes: Recipe[]): string[] {
  const names: string[] = [];
  for (const recipe of recipes) {
    for (const event of backfillCookEvents(recipe)) {
      for (const who of event.who) {
        names.push(who);
      }
    }
  }
  return names;
}

/** Remember names used in “who you cooked for” for future suggestions. */
export async function rememberCookWhoNames(names: string[]): Promise<string[]> {
  const incoming = names.map(cleanName).filter(Boolean);
  if (!incoming.length) return (await getPreferences()).cook_who_names ?? [];

  const prefs = await getPreferences();
  const next = mergeCookWhoNames(prefs.cook_who_names ?? [], incoming);
  const prev = prefs.cook_who_names ?? [];
  const same =
    next.length === prev.length &&
    next.every((name, i) => name === prev[i]);
  if (same) return next;

  await setPreferences({ cook_who_names: next });
  return next;
}

/** Preferred names plus any already used across cook logs. */
export async function listCookWhoNames(): Promise<string[]> {
  const [prefs, recipes] = await Promise.all([
    getPreferences(),
    listRecipes(),
  ]);
  const merged = mergeCookWhoNames(
    prefs.cook_who_names ?? [],
    namesFromRecipes(recipes)
  );
  const prev = prefs.cook_who_names ?? [];
  const same =
    merged.length === prev.length &&
    merged.every((name, i) => name === prev[i]);
  if (!same) {
    await setPreferences({ cook_who_names: merged });
  }
  return merged;
}
