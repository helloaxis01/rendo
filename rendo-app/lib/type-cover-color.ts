/** Stable type-cover colors from recipe id, with grid adjacency separation. */

type ColorFamily =
  | "green"
  | "teal"
  | "blue"
  | "orange"
  | "red"
  | "yellow"
  | "plum";

type Temperature = "warm" | "cool";

const TYPE_COVER_PALETTE = [
  { hex: "#1E8E5A", family: "green", temp: "cool" },
  { hex: "#FF4B1F", family: "orange", temp: "warm" },
  { hex: "#1D4E89", family: "blue", temp: "cool" },
  { hex: "#C45C26", family: "orange", temp: "warm" },
  { hex: "#E9C46A", family: "yellow", temp: "warm" },
  { hex: "#BC4749", family: "red", temp: "warm" },
  { hex: "#2A9D8F", family: "teal", temp: "cool" },
  { hex: "#D62828", family: "red", temp: "warm" },
  { hex: "#F4A261", family: "orange", temp: "warm" },
  { hex: "#6A4C93", family: "plum", temp: "cool" },
  { hex: "#048BA8", family: "blue", temp: "cool" },
  { hex: "#264653", family: "teal", temp: "cool" },
  { hex: "#E76F51", family: "orange", temp: "warm" },
  { hex: "#B5651D", family: "orange", temp: "warm" },
  { hex: "#457B9D", family: "blue", temp: "cool" },
  { hex: "#9B2226", family: "red", temp: "warm" },
] as const satisfies ReadonlyArray<{
  hex: string;
  family: ColorFamily;
  temp: Temperature;
}>;

const STORAGE_KEY = "rendo.typeCoverColorIndex";
const GRID_COLUMNS = 2;
/** Minimum circular hue distance from beside / above / previous type tile. */
const MIN_HUE_SEP = 62;

type PaletteEntry = {
  hex: string;
  hue: number;
  luminance: number;
  family: ColorFamily;
  temp: Temperature;
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

const PALETTE: PaletteEntry[] = TYPE_COVER_PALETTE.map((swatch) => ({
  hex: swatch.hex,
  family: swatch.family,
  temp: swatch.temp,
  hue: hueOf(swatch.hex),
  luminance: relativeLuminance(swatch.hex),
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

function uniqueIndexes(values: Array<number | undefined>): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    if (typeof value !== "number") continue;
    const index = ((value % PALETTE.length) + PALETTE.length) % PALETTE.length;
    if (seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }
  return out;
}

function neighborIndexes(
  i: number,
  columns: number,
  cells: Array<{ id: string; isType: boolean }>,
  assignedIndex: Map<string, number>
): { orthogonal: number[]; diagonal: number[]; previousType: number[] } {
  const colorAt = (j: number): number | undefined => {
    if (j < 0 || j >= i) return undefined;
    const cell = cells[j];
    if (!cell?.isType) return undefined;
    return assignedIndex.get(cell.id);
  };

  const col = i % columns;
  const orthogonal = uniqueIndexes([
    col > 0 ? colorAt(i - 1) : undefined,
    i >= columns ? colorAt(i - columns) : undefined,
  ]);
  const diagonal = uniqueIndexes([
    i >= columns && col > 0 ? colorAt(i - columns - 1) : undefined,
    i >= columns && col < columns - 1 ? colorAt(i - columns + 1) : undefined,
  ]);

  let previousType: number[] = [];
  for (let j = i - 1; j >= 0; j -= 1) {
    if (!cells[j]?.isType) continue;
    const index = assignedIndex.get(cells[j].id);
    if (typeof index === "number") previousType = [index];
    break;
  }

  return { orthogonal, diagonal, previousType };
}

function sameHex(a: number, b: number) {
  return PALETTE[a].hex === PALETTE[b].hex;
}

function sameFamily(a: number, b: number) {
  return PALETTE[a].family === PALETTE[b].family;
}

function sameTemp(a: number, b: number) {
  return PALETTE[a].temp === PALETTE[b].temp;
}

function tooCloseHue(a: number, b: number) {
  return hueDistance(PALETTE[a].hue, PALETTE[b].hue) < MIN_HUE_SEP;
}

function isValid(
  candidate: number,
  neighbors: { orthogonal: number[]; diagonal: number[]; previousType: number[] },
  level: "strict" | "no-temp" | "family-only" | "hex-only"
): boolean {
  const beside = uniqueIndexes([
    ...neighbors.orthogonal,
    ...neighbors.previousType,
  ]);
  const around = uniqueIndexes([...beside, ...neighbors.diagonal]);

  for (const n of around) {
    if (sameHex(candidate, n)) return false;
  }
  if (level === "hex-only") return true;

  for (const n of beside) {
    if (sameFamily(candidate, n)) return false;
  }
  if (level === "family-only") {
    for (const n of neighbors.diagonal) {
      if (sameFamily(candidate, n)) return false;
    }
    return true;
  }

  for (const n of beside) {
    if (tooCloseHue(candidate, n)) return false;
  }
  for (const n of neighbors.diagonal) {
    if (sameFamily(candidate, n)) return false;
  }
  if (level === "no-temp") return true;

  for (const n of neighbors.orthogonal) {
    if (sameTemp(candidate, n)) return false;
  }
  return true;
}

function pickIndex(
  preferred: number,
  neighbors: { orthogonal: number[]; diagonal: number[]; previousType: number[] }
): number {
  const pref =
    ((preferred % PALETTE.length) + PALETTE.length) % PALETTE.length;
  const levels = ["strict", "no-temp", "family-only", "hex-only"] as const;

  for (const level of levels) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let offset = 0; offset < PALETTE.length; offset += 1) {
      const index = (pref + offset) % PALETTE.length;
      if (!isValid(index, neighbors, level)) continue;
      let score = offset;
      for (const n of neighbors.orthogonal) {
        score -= hueDistance(PALETTE[index].hue, PALETTE[n].hue) / 1000;
      }
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) return bestIndex;
  }

  return pref;
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
 * Assign type-cover colors so the same / similar swatch never sits beside,
 * above, or immediately after another type tile.
 */
export function assignTypeCoverStylesForGrid(
  cells: Array<{ id: string; isType: boolean }>,
  columns: number = GRID_COLUMNS
): Map<string, TypeCoverStyle> {
  const assignedIndex = new Map<string, number>();
  const result = new Map<string, TypeCoverStyle>();
  const stored = readStored();

  cells.forEach((cell, i) => {
    if (!cell.isType) return;

    const neighbors = neighborIndexes(i, columns, cells, assignedIndex);
    const preferred =
      typeof stored[cell.id] === "number"
        ? stored[cell.id]
        : preferredIndex(cell.id);
    const index = pickIndex(preferred, neighbors);
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
