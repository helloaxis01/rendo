import type { Ingredient, Recipe } from "@/lib/db/types";
import { mergeCookEvents } from "@/lib/db/cook-events";
import { isUsableImageUrl } from "@/lib/cover";

function laterTimestamp(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function hasSectionHeaders(ingredients: Ingredient[]): boolean {
  return ingredients.some((ing) => Boolean(ing.section?.trim()));
}

/**
 * Keep cloud ingredient order (`position`) while restoring section headers
 * when the remote row lost them (pre-migration / partial schema).
 */
export function mergeIngredientsPreserveSections(
  remote: Ingredient[],
  local: Ingredient[] | undefined
): Ingredient[] {
  if (!remote.length) return local?.length ? local : remote;
  if (!local?.length) return remote;
  if (hasSectionHeaders(remote)) return remote;

  return remote.map((ing, index) => {
    const byIndex = local[index];
    const indexMatch =
      byIndex &&
      (byIndex.id === ing.id ||
        byIndex.search_key === ing.search_key ||
        byIndex.name === ing.name)
        ? byIndex
        : null;
    const byId = local.find((row) => row.id === ing.id);
    const byKey = local.find(
      (row) =>
        row.search_key === ing.search_key &&
        row.name.trim().toLowerCase() === ing.name.trim().toLowerCase()
    );
    const donor = indexMatch ?? byId ?? byKey;
    if (!donor?.section?.trim()) return ing;
    return {
      ...ing,
      section: donor.section,
      raw_text: ing.raw_text ?? donor.raw_text ?? null,
      preparation_notes: ing.preparation_notes ?? donor.preparation_notes ?? null,
      confidence_score: ing.confidence_score ?? donor.confidence_score ?? null,
    };
  });
}

function pickBestCoverUrl(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const aOk = isUsableImageUrl(a);
  const bOk = isUsableImageUrl(b);
  if (aOk && bOk) {
    if (a.startsWith("https:") && b.startsWith("data:")) return a;
    if (b.startsWith("https:") && a.startsWith("data:")) return b;
    return a;
  }
  if (aOk) return a;
  if (bOk) return b;
  return null;
}

/** Keep a usable cover URL from either side — never drop a photo because sync stripped it. */
export function mergeCoverFields(base: Recipe, other: Recipe): Partial<Recipe> {
  const userCover = pickBestCoverUrl(
    base.user_cover_image_url,
    other.user_cover_image_url
  );
  const coverImage = pickBestCoverUrl(base.cover_image_url, other.cover_image_url);
  const coverDisplay =
    userCover && (base.cover_display === "mine" || other.cover_display === "mine")
      ? "mine"
      : (base.cover_display ?? other.cover_display ?? "photo");

  return {
    user_cover_image_url: userCover,
    cover_image_url: coverImage,
    cover_display: coverDisplay,
    cover_image_position:
      base.cover_image_position ?? other.cover_image_position ?? null,
    user_cover_image_position:
      base.user_cover_image_position ?? other.user_cover_image_position ?? null,
  };
}

export type PullMergeResult = {
  recipe: Recipe;
  /** Local is newer — enqueue an upsert so queue-first sync pushes it. */
  pushLocal: boolean;
  /** Wrote / would write remote into local vault. */
  appliedRemote: boolean;
};

/**
 * LWW by `updated_at`, with section-preserving ingredient merge and cook-event union.
 */
export function resolveRecipePullConflict(
  remote: Recipe,
  local: Recipe | undefined
): PullMergeResult {
  if (!local) {
    return { recipe: remote, pushLocal: false, appliedRemote: true };
  }

  const remoteAt = Date.parse(remote.updated_at);
  const localAt = Date.parse(local.updated_at);
  const remoteNewer =
    Number.isFinite(remoteAt) &&
    Number.isFinite(localAt) &&
    remoteAt > localAt;
  const localNewer =
    Number.isFinite(remoteAt) &&
    Number.isFinite(localAt) &&
    localAt > remoteAt;
  const tied =
    !remoteNewer &&
    !localNewer &&
    Number.isFinite(remoteAt) &&
    Number.isFinite(localAt);

  if (localNewer) {
    return { recipe: local, pushLocal: true, appliedRemote: false };
  }

  const base = remoteNewer || tied || !Number.isFinite(localAt) ? remote : local;
  const other = base === remote ? local : remote;

  const merged: Recipe = {
    ...base,
    ...mergeCoverFields(base, other),
    rating: base.rating ?? other.rating ?? null,
    cooked: Boolean(base.cooked || other.cooked),
    times_cooked: Math.max(base.times_cooked ?? 0, other.times_cooked ?? 0),
    last_cooked_at: laterTimestamp(base.last_cooked_at, other.last_cooked_at),
    cook_events: mergeCookEvents(base.cook_events, other.cook_events),
    ingredients_normalized: mergeIngredientsPreserveSections(
      base.ingredients_normalized,
      other.ingredients_normalized
    ),
  };

  return {
    recipe: merged,
    pushLocal: false,
    appliedRemote: true,
  };
}
