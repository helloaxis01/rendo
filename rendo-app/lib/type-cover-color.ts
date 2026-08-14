/** Per-recipe type treatment on the shared glass cover. */

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

const COVER_ANGLES = [
  0, 28, 45, 90, 118, 135, 180, 208, 225, 270, 298, 315,
] as const;

export type TypeCoverStyle = {
  scaleX: number;
  letterSpacing: string;
  angle: (typeof COVER_ANGLES)[number];
};

export function typeCoverStyle(seed: string): TypeCoverStyle {
  const id = seed.trim() || "rendo";
  const hash = hashSeed(`${id}:syne`);
  const angleHash = hashSeed(`${id}:wash`);
  const width = TYPE_WIDTHS[(hash >>> 8) % TYPE_WIDTHS.length];
  return {
    scaleX: width.scaleX,
    letterSpacing: width.letterSpacing,
    angle: COVER_ANGLES[angleHash % COVER_ANGLES.length],
  };
}
