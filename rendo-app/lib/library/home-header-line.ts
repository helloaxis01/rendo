import type { Recipe, TagRecord } from "@/lib/db/types";
import { countCookedThisWeek } from "@/lib/db/queries";

export const HOME_HEADER_MAX_CHARS = 47;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const TAG_MIN_COUNT = 8;
const MILESTONE_KEY = "rendo.home.header.milestone";
const LAST_OPEN_KEY = "rendo.home.header.last-open";

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
  italian: "italian",
};

const PLAYFUL_PROMPTS = [
  "What's for dinner?",
  "Who's hungry?",
  "What are you craving?",
  "Have you cooked something lately?",
];

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function fits(text: string) {
  return text.length <= HOME_HEADER_MAX_CHARS;
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

function tagLine(tag: TagRecord) {
  return `${tag.count} ${tag.name} recipes saved — ${flavorForTag(tag.name)}`;
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

export function readLastOpenAt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_OPEN_KEY);
}

export function writeLastOpenAt(iso: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_OPEN_KEY, iso);
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
    lastOpenAt?: string | null;
    favoriteChance?: number;
  }
): HomeHeaderPick {
  const now = options?.now ?? new Date();
  const random = options?.random ?? Math.random;
  const favoriteChance = options?.favoriteChance ?? 1 / 3;
  const shownMilestone = options?.shownMilestone ?? readShownMilestone();
  const lastOpenAt =
    options?.lastOpenAt === undefined ? readLastOpenAt() : options.lastOpenAt;
  const nowMs = now.getTime();

  const uncookedFavorites = recipes.filter((recipe) => {
    if (!recipe.is_favorite || isCooked(recipe)) return false;
    return fits(`Haven't tried ${recipe.title} yet`);
  });
  if (uncookedFavorites.length > 0 && random() < favoriteChance) {
    const recipe = pickOne(uncookedFavorites, random);
    return { text: `Haven't tried ${recipe.title} yet` };
  }

  const recentFit = recipes
    .filter((recipe) => {
      const at = Date.parse(recipe.created_at);
      return Number.isFinite(at) && nowMs - at <= THREE_DAYS_MS && nowMs - at >= 0;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((recipe) => {
      const day = new Date(recipe.created_at).toLocaleDateString(undefined, {
        weekday: "long",
      });
      return `New: ${recipe.title}, saved ${day}`;
    })
    .find(fits);
  if (recentFit) return { text: recentFit };

  if (lastOpenAt) {
    const since = Date.parse(lastOpenAt);
    if (Number.isFinite(since)) {
      const added = recipes.filter((recipe) => {
        const at = Date.parse(recipe.created_at);
        return Number.isFinite(at) && at > since;
      }).length;
      if (added > 0) {
        const text =
          added === 1
            ? "1 new recipe since last time"
            : `${added} new recipes since last time`;
        if (fits(text)) return { text };
      }
    }
  }

  const pooled = tags.length > 0 ? tags : tagCountsFromRecipes(recipes);
  const tagFits = pooled
    .filter((tag) => tag.count >= TAG_MIN_COUNT)
    .map(tagLine)
    .filter(fits);
  if (tagFits.length > 0) {
    return { text: pickOne(tagFits, random) };
  }

  const lastCooked = recipes.reduce((latest, recipe) => {
    const at = recipe.last_cooked_at ? Date.parse(recipe.last_cooked_at) : NaN;
    if (!Number.isFinite(at)) return latest;
    return Math.max(latest, at);
  }, 0);
  if (lastCooked > 0 && nowMs - lastCooked >= FIVE_DAYS_MS) {
    return { text: "Time to cook something new?" };
  }

  const nextMilestone = [...milestonesUpTo(recipes.length)]
    .reverse()
    .find((n) => n > shownMilestone);
  if (nextMilestone) {
    const text = `${nextMilestone} recipes saved`;
    if (fits(text)) return { text, milestone: nextMilestone };
  }

  const cookedThisWeek = countCookedThisWeek(recipes);
  if (cookedThisWeek > 0) {
    const text = `${cookedThisWeek} cooked this week`;
    if (fits(text)) return { text };
  }

  const prompt = pickOne(PLAYFUL_PROMPTS, random);
  if (fits(prompt)) return { text: prompt };

  return { text: greetingForHour(now.getHours()) };
}
