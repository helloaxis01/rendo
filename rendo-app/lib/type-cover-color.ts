/** Stable type-cover colors from a recipe id/title seed. */

const TYPE_COVER_PALETTE = [
  "#1E8E5A", // green
  "#FF4B1F", // citrus red-orange
  "#0B6E4F", // deep emerald
  "#1D4E89", // strong blue
  "#C45C26", // burnt orange
  "#2A9D8F", // teal
  "#E9C46A", // mustard
  "#264653", // ink teal
  "#E76F51", // coral
  "#40916C", // mid green
  "#BC4749", // brick
  "#457B9D", // slate blue
  "#F4A261", // sand
  "#1B4332", // forest
  "#D62828", // red
  "#048BA8", // cyan-blue
] as const;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

/** Relative luminance (0–1) for contrast decisions. */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export type TypeCoverStyle = {
  backgroundColor: string;
  color: string;
};

/** Deterministic background + readable black/white text for type covers. */
export function typeCoverStyle(seed: string): TypeCoverStyle {
  const key = seed.trim() || "rendo";
  const backgroundColor =
    TYPE_COVER_PALETTE[hashSeed(key) % TYPE_COVER_PALETTE.length];
  // Mid-luminance colors get black text for clearer reading on phone screens
  const color = relativeLuminance(backgroundColor) > 0.42 ? "#0A0A0A" : "#FAFAF8";
  return { backgroundColor, color };
}
