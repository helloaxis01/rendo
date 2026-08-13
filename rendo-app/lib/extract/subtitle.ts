/** Local one-line type-cover tagline. No extra model call. */

const GENERIC =
  /\b(delicious|yummy|tasty|amazing|must[- ]try|homemade goodness|easy recipe)\b/i;

const NOTES: Array<{ pattern: RegExp; phrase: string }> = [
  { pattern: /\bblack pepper|pepper\b/, phrase: "glossy and sharp with pepper" },
  { pattern: /\blemon\b/, phrase: "bright with lemon" },
  { pattern: /\blime\b/, phrase: "sharp with lime" },
  { pattern: /\bgarlic\b/, phrase: "heavy on the garlic" },
  { pattern: /\bbasil|pesto\b/, phrase: "herby and green" },
  { pattern: /\bmint\b/, phrase: "cool with mint" },
  { pattern: /\bchili|chilli|harissa|gochujang|cayenne\b/, phrase: "warmed with chili" },
  { pattern: /\bsesame|tahini\b/, phrase: "nutty with sesame" },
  { pattern: /\bmiso\b/, phrase: "deep with miso" },
  { pattern: /\bparmesan|pecorino|pecorino romano\b/, phrase: "salty with cheese" },
  { pattern: /\byogurt|yoghurt\b/, phrase: "cooled with yogurt" },
  { pattern: /\bginger\b/, phrase: "built around ginger" },
  { pattern: /\btomato/, phrase: "saucy with tomato" },
];

const ONES = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

export function normalizeSubtitle(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 12 || text.length > 110) return null;
  if (GENERIC.test(text)) return null;
  return text.replace(/[.!?]+$/g, "").trim();
}

function wordCount(n: number): string | null {
  if (n >= 1 && n <= 10) return ONES[n - 1];
  return null;
}

export function displaySubtitle(recipe: {
  subtitle?: string | null;
  subtitle_manual?: boolean;
  title?: string;
  tags?: string[];
  ingredients_normalized?: Array<{ name: string }>;
}): string | null {
  if (recipe.subtitle_manual) {
    return recipe.subtitle?.replace(/\s+/g, " ").trim() || null;
  }
  return (
    normalizeSubtitle(recipe.subtitle) ??
    composeSubtitle({
      title: recipe.title,
      tags: recipe.tags,
      ingredients: recipe.ingredients_normalized,
    })
  );
}

export function composeSubtitle(input: {
  title?: string;
  tags?: string[];
  ingredients?: Array<{ name: string }>;
  description?: string;
}): string | null {
  const names = (input.ingredients ?? [])
    .map((item) =>
      item.name
        .toLowerCase()
        .replace(/\([^)]*\)/g, "")
        .replace(/\b(fresh|chopped|diced|minced|optional|to taste)\b/g, "")
        .trim()
    )
    .filter((name) => name.length > 2 && !/edit me|ingredient/i.test(name));

  if (names.length < 3) return null;

  const blob = names.join(" ");
  const note = NOTES.find((entry) => entry.pattern.test(blob))?.phrase;
  const count = wordCount(names.length);
  if (count && note) {
    return `${count[0].toUpperCase()}${count.slice(1)} ingredients, ${note}`;
  }
  if (note) return note[0].toUpperCase() + note.slice(1);
  if (count) return `${count[0].toUpperCase()}${count.slice(1)} ingredients`;
  return null;
}
