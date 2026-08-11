const VOLUME: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  cups: 236.588,
  ml: 1,
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
};

export type UnitSystem = "imperial" | "metric";

export function convertAmount(
  amount: number | null,
  unit: string | null,
  system: UnitSystem
): { amount: number | null; unit: string | null } {
  if (amount == null || !unit) return { amount, unit };

  const key = unit.toLowerCase();

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
    if (key === "ml" || key === "l" || key === "liter" || key === "liters") {
      const ml = key.startsWith("l") ? amount * 1000 : amount;
      if (ml >= 236.588) return { amount: round(ml / 236.588), unit: "cups" };
      if (ml >= 14.7868) return { amount: round(ml / 14.7868), unit: "tbsp" };
      return { amount: round(ml / 4.92892), unit: "tsp" };
    }
    if (key === "g" || key === "kg" || key.startsWith("gram")) {
      const g = key === "kg" ? amount * 1000 : amount;
      if (g >= 453.592) return { amount: round(g / 453.592), unit: "lbs" };
      return { amount: round(g / 28.3495), unit: "oz" };
    }
  }

  return { amount, unit };
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
