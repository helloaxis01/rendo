const VOLUME: Record<string, number> = {
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  cup: 236.588,
  cups: 236.588,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
};

const MASS: Record<string, number> = {
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
};

/** Short display forms so unit columns stay compact. */
const UNIT_ABBREV: Record<string, string> = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cups",
  milliliter: "ml",
  milliliters: "ml",
  liter: "L",
  liters: "L",
  l: "L",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lbs",
  lbs: "lbs",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  pinch: "pinch",
  pinches: "pinch",
  clove: "clove",
  cloves: "cloves",
  can: "can",
  cans: "cans",
  package: "pkg",
  packages: "pkg",
  bunch: "bunch",
  bunches: "bunch",
};

export type UnitSystem = "imperial" | "metric";

export function abbreviateUnit(unit: string | null | undefined): string | null {
  if (!unit?.trim()) return null;
  const key = unit.trim().toLowerCase();
  return UNIT_ABBREV[key] ?? unit.trim();
}

export function convertAmount(
  amount: number | null,
  unit: string | null,
  system: UnitSystem
): { amount: number | null; unit: string | null } {
  if (amount == null || !unit) return { amount, unit: abbreviateUnit(unit) };

  const key = unit.toLowerCase().trim();

  if (system === "metric") {
    if (key in VOLUME) {
      const ml = amount * VOLUME[key];
      if (ml >= 1000) return { amount: round(ml / 1000), unit: "L" };
      return { amount: round(ml), unit: "ml" };
    }
    if (key in MASS) {
      const g = amount * MASS[key];
      if (g >= 1000) return { amount: round(g / 1000), unit: "kg" };
      return { amount: round(g), unit: "g" };
    }
  }

  if (system === "imperial") {
    if (
      key === "ml" ||
      key === "l" ||
      key === "liter" ||
      key === "liters" ||
      key === "milliliter" ||
      key === "milliliters"
    ) {
      const ml = key === "l" || key.startsWith("liter") ? amount * 1000 : amount;
      if (ml >= 236.588) return { amount: round(ml / 236.588), unit: "cups" };
      if (ml >= 14.7868) return { amount: round(ml / 14.7868), unit: "tbsp" };
      return { amount: round(ml / 4.92892), unit: "tsp" };
    }
    if (key === "g" || key === "kg" || key.startsWith("gram") || key.startsWith("kilo")) {
      const g = key === "kg" || key.startsWith("kilo") ? amount * 1000 : amount;
      if (g >= 453.592) return { amount: round(g / 453.592), unit: "lbs" };
      return { amount: round(g / 28.3495), unit: "oz" };
    }
  }

  return { amount, unit: abbreviateUnit(unit) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatIngredientLine(
  amount: number | null,
  unit: string | null,
  name: string,
  system: UnitSystem
) {
  const converted = convertAmount(amount, unit, system);
  const qty =
    converted.amount == null
      ? ""
      : `${converted.amount}${converted.unit ? ` ${converted.unit}` : ""} `;
  return `${qty}${name}`.trim();
}

export function scaleAmount(amount: number | null, base: number, target: number) {
  if (amount == null) return null;
  if (!base) return amount;
  return Math.round(amount * (target / base) * 100) / 100;
}
