/** Stable type-cover colors from recipe id, with grid adjacency separation. */

const TYPE_COVER_PALETTE = [
  "#1E8E5A", // green
  "#FF4B1F", // citrus red-orange
  "#1D4E89", // strong blue
  "#C45C26", // burnt orange
  "#E9C46A", // mustard
  "#BC4749", // brick
  "#2A9D8F", // teal
  "#D62828", // red
  "#F4A261", // sand
  "#6A4C93", // plum
  "#048BA8", // cyan-blue
  "#264653", // ink teal
  "#E76F51", // coral
  "#B5651D", // amber brown
  "#457B9D", // slate blue
  "#9B2226", // wine
] as const;

const STORAGE_KEY = "rendo.typeCoverColorIndex";
const GRID_COLUMNS = 2;
/** Minimum circular hue distance between neighboring type tiles. */
const MIN_HUE_SEP = 48;

type PaletteEntry = {
  hex: string;
  hue: number;
  luminance: number;
};

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

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function hueOf(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === R) hue = ((G - B) / delta) % 6;
  else if (max === G) hue = (B - R) / delta + 2;
  else hue = (R - G) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

const PALETTE: PaletteEntry[] = TYPE_COVER_PALETTE.map((hex) => ({
  hex,
  hue: hueOf(hex),
  luminance: relativeLuminance(hex),
}));

export type TypeCoverStyle = {
  backgroundColor: string;
  color: string;
};

function styleFromIndex(index: number): TypeCoverStyle {
  const entry =
    PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
  return {
    backgroundColor: entry.hex,
    color: entry.luminance > 0.42 ? "#0A0A0A" : "#FAFAF8",
  };
}

function preferredIndex(seed: string): number {
  return hashSeed(seed.trim() || "rendo") % PALETTE.length;
}

function readStored(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[id] = Math.trunc(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStored(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function neighborPenalty(candidateHue: number, neighborHues: number[]): number {
  if (!neighborHues.length) return 0;
  let worst = Infinity;
  for (const hue of neighborHues) {
    worst = Math.min(worst, hueDistance(candidateHue, hue));
  }
  if (worst < MIN_HUE_SEP) return 1000 - worst;
  return -worst;
}

function pickIndex(preferred: number, neighborHues: number[]): number {
  let bestIndex = preferred;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let offset = 0; offset < PALETTE.length; offset += 1) {
    const index = (preferred + offset) % PALETTE.length;
    const penalty = neighborPenalty(PALETTE[index].hue, neighborHues);
    const score = penalty + (offset === 0 ? -0.01 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/** Deterministic style for a single recipe (cooking screen). Uses last grid assignment when available. */
export function typeCoverStyle(seed: string): TypeCoverStyle {
  const id = seed.trim() || "rendo";
  const stored = readStored();
  if (typeof stored[id] === "number") {
    return styleFromIndex(stored[id]);
  }
  return styleFromIndex(preferredIndex(id));
}

/**
 * Pure assignment for a 2-column grid so similar hues stay apart among
 * neighboring type tiles. Same inputs always yield the same colors.
 */
export function assignTypeCoverStylesForGrid(
  cells: Array<{ id: string; isType: boolean }>,
  columns: number = GRID_COLUMNS
): Map<string, TypeCoverStyle> {
  const assignedIndex = new Map<string, number>();
  const result = new Map<string, TypeCoverStyle>();

  cells.forEach((cell, i) => {
    if (!cell.isType) return;

    const neighborHues: number[] = [];
    if (i % columns !== 0) {
      const left = cells[i - 1];
      if (left?.isType) {
        const leftIndex = assignedIndex.get(left.id);
        if (typeof leftIndex === "number") {
          neighborHues.push(PALETTE[leftIndex % PALETTE.length].hue);
        }
      }
    }
    if (i >= columns) {
      const above = cells[i - columns];
      if (above?.isType) {
        const aboveIndex = assignedIndex.get(above.id);
        if (typeof aboveIndex === "number") {
          neighborHues.push(PALETTE[aboveIndex % PALETTE.length].hue);
        }
      }
    }

    const index = pickIndex(preferredIndex(cell.id), neighborHues);
    assignedIndex.set(cell.id, index);
    result.set(cell.id, styleFromIndex(index));
  });

  return result;
}

/** Persist grid assignments so cooking covers match library tiles. */
export function persistTypeCoverStyles(styles: Map<string, TypeCoverStyle>) {
  if (typeof window === "undefined" || styles.size === 0) return;
  const stored = readStored();
  const byHex = new Map(PALETTE.map((entry, index) => [entry.hex, index]));
  for (const [id, style] of styles) {
    const index = byHex.get(style.backgroundColor);
    if (typeof index === "number") stored[id] = index;
  }
  writeStored(stored);
}
