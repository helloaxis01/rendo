/** Downscale target so the pre-check stays cheap on device. */
const SAMPLE_EDGE = 96;

export const TOO_DARK_PHOTO_MESSAGE =
  "That photo is too dark. Try more light.";
export const TOO_BRIGHT_PHOTO_MESSAGE =
  "That photo is washed out. Reduce glare and try again.";
export const LOW_CONTRAST_PHOTO_MESSAGE =
  "Text unreadable, try a clearer photo.";

export type ImageQualityIssue = "too-dark" | "too-bright" | "low-contrast";

type LumaStats = {
  mean: number;
  stddev: number;
  p10: number;
  p90: number;
  spread: number;
  edge: number;
};

/**
 * Conservative gates — only reject frames that cannot hold readable recipe text.
 * Dim kitchen shots and Instagram screenshots should still pass.
 */
export function qualityIssueFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): ImageQualityIssue | null {
  if (width < 1 || height < 1 || rgba.length < 4) return "low-contrast";
  const stats = lumaStats(rgba, width, height);

  if (stats.mean < 18 || (stats.mean < 28 && stats.p90 < 55)) {
    return "too-dark";
  }
  if (stats.mean > 247 || (stats.mean > 238 && stats.spread < 18)) {
    return "too-bright";
  }
  if (
    (stats.spread < 22 && stats.edge < 8) ||
    (stats.stddev < 10 && stats.edge < 6)
  ) {
    return "low-contrast";
  }
  return null;
}

export function messageForImageQuality(issue: ImageQualityIssue): string {
  if (issue === "too-dark") return TOO_DARK_PHOTO_MESSAGE;
  if (issue === "too-bright") return TOO_BRIGHT_PHOTO_MESSAGE;
  return LOW_CONTRAST_PHOTO_MESSAGE;
}

/** Throws before /api/extract when a session frame is unusable. */
export async function assertPhotosUsableForExtract(files: File[]): Promise<void> {
  for (let index = 0; index < files.length; index += 1) {
    const issue = await assessImageQuality(files[index]);
    if (!issue) continue;
    const prefix =
      files.length > 1 ? `Photo ${index + 1} of ${files.length}: ` : "";
    throw new Error(prefix + messageForImageQuality(issue));
  }
}

export async function assessImageQuality(
  file: File
): Promise<ImageQualityIssue | null> {
  const sampled = await sampleRgba(file);
  if (!sampled) return null;
  return qualityIssueFromRgba(sampled.data, sampled.width, sampled.height);
}

function lumaStats(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): LumaStats {
  const hist = new Uint32Array(256);
  const luma = new Uint8Array(width * height);
  let sum = 0;
  let i = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    const y = Math.max(
      0,
      Math.min(
        255,
        Math.round(0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2])
      )
    );
    luma[i] = y;
    hist[y] += 1;
    sum += y;
    i += 1;
  }
  const count = Math.max(1, i);
  const mean = sum / count;
  let variance = 0;
  for (let y = 0; y < 256; y += 1) {
    const delta = y - mean;
    variance += hist[y] * delta * delta;
  }
  const stddev = Math.sqrt(variance / count);
  const p10 = percentileFromHist(hist, count, 0.1);
  const p90 = percentileFromHist(hist, count, 0.9);

  let edgeSum = 0;
  let edgeCount = 0;
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * width;
    for (let col = 0; col < width - 1; col += 1) {
      edgeSum += Math.abs(luma[rowStart + col] - luma[rowStart + col + 1]);
      edgeCount += 1;
    }
  }

  return {
    mean,
    stddev,
    p10,
    p90,
    spread: p90 - p10,
    edge: edgeCount ? edgeSum / edgeCount : 0,
  };
}

function percentileFromHist(
  hist: Uint32Array,
  count: number,
  fraction: number
): number {
  const target = Math.max(1, Math.round(count * fraction));
  let seen = 0;
  for (let y = 0; y < 256; y += 1) {
    seen += hist[y];
    if (seen >= target) return y;
  }
  return 255;
}

async function sampleRgba(
  file: File
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  if (typeof document === "undefined") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale =
      Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height)) || 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { data, width, height };
  } catch {
    // Fail open — prepare/extract still handle undecodable files.
    return null;
  } finally {
    bitmap?.close();
  }
}
