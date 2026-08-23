/** Convertible unit families for shopping-list quantity merges. */

const VOLUME_TO_ML: Record<string, number> = {
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

const MASS_TO_G: Record<string, number> = {
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

function unitKey(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase();
}

export type MeasureFamily = "volume" | "mass" | "count" | "none";

export function measureFamily(unit: string | null | undefined): MeasureFamily {
  const key = unitKey(unit);
  if (!key) return "none";
  if (key in VOLUME_TO_ML) return "volume";
  if (key in MASS_TO_G) return "mass";
  return "count";
}

export function unitsCompatible(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const fa = measureFamily(a);
  const fb = measureFamily(b);
  if (fa === "none" && fb === "none") return true;
  if (fa === "none" || fb === "none") return false;
  if (fa === "count" || fb === "count") {
    return unitKey(a) === unitKey(b);
  }
  return fa === fb;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Prefer a readable display unit when summing a family. */
export function combineAmounts(
  aAmount: number | null,
  aUnit: string | null,
  bAmount: number | null,
  bUnit: string | null
): { amount: number | null; unit: string | null } | null {
  if (!unitsCompatible(aUnit, bUnit)) return null;

  const family = measureFamily(aUnit) === "none" ? measureFamily(bUnit) : measureFamily(aUnit);

  if (family === "none") {
    return { amount: null, unit: null };
  }

  if (aAmount == null && bAmount == null) {
    return { amount: null, unit: aUnit?.trim() || bUnit?.trim() || null };
  }
  if (aAmount == null || bAmount == null) return null;

  if (family === "count") {
    return {
      amount: round(aAmount + bAmount),
      unit: aUnit?.trim() || bUnit?.trim() || null,
    };
  }

  if (family === "volume") {
    const aMl = aAmount * VOLUME_TO_ML[unitKey(aUnit)];
    const bMl = bAmount * VOLUME_TO_ML[unitKey(bUnit)];
    const ml = aMl + bMl;
    if (ml >= 1000) return { amount: round(ml / 1000), unit: "L" };
    if (ml >= 236.588) return { amount: round(ml / 236.588), unit: "cups" };
    if (ml >= 14.7868) return { amount: round(ml / 14.7868), unit: "tbsp" };
    if (ml >= 4.92892) return { amount: round(ml / 4.92892), unit: "tsp" };
    return { amount: Math.round(ml), unit: "ml" };
  }

  const aG = aAmount * MASS_TO_G[unitKey(aUnit)];
  const bG = bAmount * MASS_TO_G[unitKey(bUnit)];
  const g = aG + bG;
  if (g >= 1000) return { amount: round(g / 1000), unit: "kg" };
  if (g >= 453.592) return { amount: round(g / 453.592), unit: "lb" };
  if (g >= 28.3495) return { amount: round(g / 28.3495), unit: "oz" };
  return { amount: Math.round(g), unit: "g" };
}
