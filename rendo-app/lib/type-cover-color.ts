/** Per-recipe type treatment: charcoal field + muted accent tint. */

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const TYPE_WIDTHS = [
  { scaleX: 0.84, letterSpacing: "-0.06em" },
  { scaleX: 0.92, letterSpacing: "-0.03em" },
  { scaleX: 1, letterSpacing: "0.06em" },
  { scaleX: 1.1, letterSpacing: "0.14em" },
] as const;

/** Saturation 20–35%, lightness 35–50%. Warm only. */
const ACCENTS = [
  "hsl(18 28% 42%)",
  "hsl(6 24% 46%)",
  "hsl(72 22% 38%)",
  "hsl(38 30% 44%)",
  "hsl(14 26% 40%)",
  "hsl(28 16% 38%)",
] as const;

export type TypeCoverStyle = {
  scaleX: number;
  letterSpacing: string;
  accent: (typeof ACCENTS)[number];
};

export function typeCoverStyle(seed: string): TypeCoverStyle {
  const id = seed.trim() || "rendo";
  const hash = hashSeed(`${id}:syne`);
  const accentHash = hashSeed(`${id}:tint`);
  const width = TYPE_WIDTHS[(hash >>> 8) % TYPE_WIDTHS.length];
  return {
    scaleX: width.scaleX,
    letterSpacing: width.letterSpacing,
    accent: ACCENTS[accentHash % ACCENTS.length],
  };
}
