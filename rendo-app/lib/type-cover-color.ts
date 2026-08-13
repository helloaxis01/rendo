/** Type covers from blurred food photos, assigned with neighbor hue separation. */

import {
  FOOD_COVER_PALETTES,
  type FoodCoverPalette,
} from "@/lib/type-cover-food";
import {
  paletteIdForHint,
  type TypeCoverHint,
} from "@/lib/type-cover-hint";

const STORAGE_KEY = "rendo.typeCoverFoodId";
const GRID_COLUMNS = 2;
const MIN_HUE_SEP = 40;
const PALETTES = FOOD_COVER_PALETTES;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export type TypeCoverStyle = {
  id: string;
  hue: number;
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  image: string;
};

function styleFromPalette(palette: FoodCoverPalette): TypeCoverStyle {
  const [a, b, c] = palette.colors;
  return {
    id: palette.id,
    hue: palette.hue,
    color: palette.color,
    backgroundColor: palette.backgroundColor,
    image: palette.src,
    backgroundImage: `linear-gradient(145deg, ${a} 0%, ${b} 48%, ${c} 100%)`,
  };
}

function preferredIndex(seed: string): number {
  return hashSeed(seed.trim() || "rendo") % PALETTES.length;
}

function readStored(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string" && PALETTES.some((p) => p.id === value)) {
        out[id] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStored(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function paletteIndex(id: string): number {
  const index = PALETTES.findIndex((p) => p.id === id);
  return index >= 0 ? index : 0;
}

function hintedIndex(hint?: TypeCoverHint | null): number | null {
  const id = paletteIdForHint(hint);
  if (!id) return null;
  const index = paletteIndex(id);
  return PALETTES[index]?.id === id ? index : null;
}

function neighborIndexes(
  i: number,
  columns: number,
  cells: Array<{ id: string; isType: boolean }>,
  assigned: Map<string, number>
): number[] {
  const at = (j: number): number | undefined => {
    if (j < 0 || j >= i) return undefined;
    const cell = cells[j];
    if (!cell?.isType) return undefined;
    return assigned.get(cell.id);
  };
  const col = i % columns;
  const out: number[] = [];
  const push = (value: number | undefined) => {
    if (typeof value === "number") out.push(value);
  };
  push(col > 0 ? at(i - 1) : undefined);
  push(i >= columns ? at(i - columns) : undefined);
  push(i >= columns && col > 0 ? at(i - columns - 1) : undefined);
  push(i >= columns && col < columns - 1 ? at(i - columns + 1) : undefined);
  for (let j = i - 1; j >= 0; j -= 1) {
    if (!cells[j]?.isType) continue;
    push(assigned.get(cells[j].id));
    break;
  }
  return out;
}

function pickIndex(preferred: number, neighbors: number[]): number {
  const count = PALETTES.length;
  if (!neighbors.length) return preferred % count;

  let best = preferred % count;
  let bestScore = -1;
  for (let offset = 0; offset < count; offset += 1) {
    const index = (preferred + offset) % count;
    if (neighbors.includes(index)) continue;
    const minSep = neighbors.reduce(
      (min, n) => Math.min(min, hueDistance(PALETTES[index].hue, PALETTES[n].hue)),
      180
    );
    if (minSep >= MIN_HUE_SEP) return index;
    if (minSep > bestScore) {
      bestScore = minSep;
      best = index;
    }
  }
  return best;
}

export function typeCoverStyle(
  seed: string,
  hint?: TypeCoverHint | null
): TypeCoverStyle {
  const id = seed.trim() || "rendo";
  const hinted = hintedIndex(hint);
  if (hinted != null) return styleFromPalette(PALETTES[hinted]);
  const stored = readStored();
  const index =
    stored[id] != null ? paletteIndex(stored[id]) : preferredIndex(id);
  return styleFromPalette(PALETTES[index]);
}

export function assignTypeCoverStylesForGrid(
  cells: Array<{ id: string; isType: boolean; hint?: TypeCoverHint | null }>,
  columns: number = GRID_COLUMNS
): Map<string, TypeCoverStyle> {
  const assigned = new Map<string, number>();
  const result = new Map<string, TypeCoverStyle>();
  const stored = readStored();

  cells.forEach((cell, i) => {
    if (!cell.isType) return;
    const hinted = hintedIndex(cell.hint);
    if (hinted != null) {
      assigned.set(cell.id, hinted);
      result.set(cell.id, styleFromPalette(PALETTES[hinted]));
      return;
    }
    const preferred =
      stored[cell.id] != null
        ? paletteIndex(stored[cell.id])
        : preferredIndex(cell.id);
    const index = pickIndex(
      preferred,
      neighborIndexes(i, columns, cells, assigned)
    );
    assigned.set(cell.id, index);
    result.set(cell.id, styleFromPalette(PALETTES[index]));
  });

  return result;
}

export function persistTypeCoverStyles(styles: Map<string, TypeCoverStyle>) {
  if (typeof window === "undefined" || styles.size === 0) return;
  const stored = readStored();
  for (const [id, style] of styles) {
    stored[id] = style.id;
  }
  writeStored(stored);
}
