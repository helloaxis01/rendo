import type { Recipe, TagRecord } from "@/lib/db/types";
import { countCookedThisWeek } from "@/lib/db/queries";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const TAG_MIN_COUNT = 8;
const MILESTONE_KEY = "rendo.home.header.milestone";

const TAG_FLAVOR: Record<string, string> = {
  pasta: "carbs",
  noodle: "carbs",
  noodles: "carbs",
  spaghetti: "carbs",
  dessert: "sweets",
  desserts: "sweets",
  sweet: "sweets",
  sweets: "sweets",
  cake: "sweets",
  baking: "sweets",
  chicken: "protein",
  beef: "protein",
  pork: "protein",
  turkey: "protein",
  steak: "protein",
  fish: "protein",
  seafood: "protein",
  shrimp: "protein",
  protein: "protein",
  salad: "greens",
  salads: "greens",
  vegetable: "greens",
  vegetables: "greens",
  veggie: "greens",
  vegan: "plants",
  vegetarian: "plants",
  soup: "cozy",
  soups: "cozy",
  stew: "cozy",
  breakfast: "breakfast",
  brunch: "brunch",
  spicy: "heat",
  chili: "heat",
  bread: "carbs",
  asian: "takeout",
  mexican: "spice",
  tacos: "spice",
  italian: "italy",
};

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function isCooked(recipe: Recipe) {
  return (
    recipe.cooked === true ||
    (recipe.times_cooked ?? 0) > 0 ||
    Boolean(recipe.last_cooked_at)
  );
}

function pickOne<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function tagCountsFromRecipes(recipes: Recipe[]): TagRecord[] {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      const name = tag.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, count]) => ({
    id: name,
    name,
    count,
  }));
}

function flavorForTag(tag: string) {
  const mapped = TAG_FLAVOR[tag.trim().toLowerCase()];
  if (mapped) return `feeling ${mapped} tonight?`;
  return "what sounds good tonight?";
}

export function milestonesUpTo(count: number): number[] {
  const out: number[] = [];
  if (count >= 25) out.push(25);
  for (let n = 50; n <= count; n += 50) out.push(n);
  return out;
}

export function readShownMilestone(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(window.localStorage.getItem(MILESTONE_KEY));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function writeShownMilestone(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MILESTONE_KEY, String(value));
}

export type HomeHeaderPick = {
  text: string;
  milestone?: number;
};

export function pickHomeHeaderLine(
  recipes: Recipe[],
  tags: TagRecord[],
  options?: {
    now?: Date;
    random?: () => number;
    shownMilestone?: number;
    favoriteChance?: number;
  }
): HomeHeaderPick {
  const now = options?.now ?? new Date();
  const random = options?.random ?? Math.random;
  const favoriteChance = options?.favoriteChance ?? 1 / 3;
  const shownMilestone = options?.shownMilestone ?? readShownMilestone();
  const nowMs = now.getTime();

  const uncookedFavorites = recipes.filter(
    (recipe) => recipe.is_favorite && !isCooked(recipe)
  );
  if (uncookedFavorites.length > 0 && random() < favoriteChance) {
    const recipe = pickOne(uncookedFavorites, random);
    return { text: `Haven't tried ${recipe.title} yet` };
  }

  const recent = recipes
    .filter((recipe) => {
      const at = Date.parse(recipe.created_at);
      return Number.isFinite(at) && nowMs - at <= THREE_DAYS_MS && nowMs - at >= 0;
    })
    .sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
  if (recent[0]) {
    const day = new Date(recent[0].created_at).toLocaleDateString(undefined, {
      weekday: "long",
    });
    return { text: `New: ${recent[0].title}, saved ${day}` };
  }

  const pooled =
    tags.length > 0 ? tags : tagCountsFromRecipes(recipes);
  const bigTags = pooled.filter((tag) => tag.count >= TAG_MIN_COUNT);
  if (bigTags.length > 0) {
    const tag = pickOne(bigTags, random);
    return {
      text: `${tag.count} ${tag.name} recipes saved — ${flavorForTag(tag.name)}`,
    };
  }

  const nextMilestone = [...milestonesUpTo(recipes.length)]
    .reverse()
    .find((n) => n > shownMilestone);
  if (nextMilestone) {
    return {
      text: `${nextMilestone} recipes saved`,
      milestone: nextMilestone,
    };
  }

  const cookedThisWeek = countCookedThisWeek(recipes);
  if (cookedThisWeek > 0) {
    return { text: `${cookedThisWeek} cooked this week` };
  }

  return { text: greetingForHour(now.getHours()) };
}
