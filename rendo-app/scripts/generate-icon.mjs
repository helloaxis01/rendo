/**
 * App icons for web + iOS (any / dark / tinted).
 *
 * Packs the four rules and RENDO into a centered square: equal gaps
 * between the five elements, overall height matching the mark width.
 *
 * Run: npm run icon:generate
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SIZE = 1024;

function sampleCorner(ctx) {
  const [r, g, b] = ctx.getImageData(2, 2, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}

function findBands(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const [br, bg, bb] = ctx.getImageData(2, 2, 1, 1).data;
  const floor = (br + bg + bb) / 3 + 30;
  const active = [];
  for (let y = 0; y < h; y++) {
    let hits = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 > floor) hits += 1;
    }
    active.push(hits > w * 0.02);
  }

  const raw = [];
  let start = -1;
  for (let y = 0; y < h; y++) {
    if (active[y] && start < 0) start = y;
    if (!active[y] && start >= 0) {
      raw.push({ start, end: y - 1 });
      start = -1;
    }
  }
  if (start >= 0) raw.push({ start, end: h - 1 });

  const merged = [];
  for (const band of raw) {
    const prev = merged[merged.length - 1];
    if (prev && band.start - prev.end <= 8) prev.end = band.end;
    else merged.push({ ...band });
  }
  return merged.map((band) => ({
    start: band.start,
    height: band.end - band.start + 1,
  }));
}

function evenGaps(total, parts) {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

function markWidth(ctx, w, h, floor) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w;
  let maxX = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 <= floor) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  return maxX - minX + 1;
}

async function equalize(sourcePath) {
  const image = await loadImage(sourcePath);
  const src = createCanvas(image.width, image.height);
  const sctx = src.getContext("2d");
  sctx.drawImage(image, 0, 0);
  const bands = findBands(sctx, image.width, image.height);
  if (bands.length !== 5) {
    throw new Error(
      `${path.basename(sourcePath)}: expected 5 mark bands, found ${bands.length}`
    );
  }

  const [br, bg, bb] = sctx.getImageData(2, 2, 1, 1).data;
  const floor = (br + bg + bb) / 3 + 30;
  const scale = SIZE / image.width;
  const heights = bands.map((band) => Math.max(1, Math.round(band.height * scale)));
  const stackH = heights.reduce((sum, h) => sum + h, 0);
  const side = Math.max(
    stackH,
    Math.round(markWidth(sctx, image.width, image.height, floor) * scale)
  );
  const gaps = evenGaps(side - stackH, bands.length - 1);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = sampleCorner(sctx);
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingEnabled = false;

  let y = Math.round((SIZE - side) / 2);
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    ctx.drawImage(
      src,
      0,
      band.start,
      image.width,
      band.height,
      0,
      y,
      SIZE,
      heights[i]
    );
    y += heights[i] + (gaps[i] ?? 0);
  }
  return canvas;
}

async function writePng(buf, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

async function writeSized(master, dest, size) {
  if (size === SIZE) {
    await writePng(await master.encode("png"), dest);
    return;
  }
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(master, 0, 0, size, size);
  await writePng(await c.encode("png"), dest);
}

const ios = path.join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset"
);

const light = await equalize(path.join(root, "public/icon.png"));
const dark = await equalize(path.join(ios, "AppIcon-Dark.png"));
const tinted = await equalize(path.join(ios, "AppIcon-Tinted.png"));

const webOuts = [
  ["public/icon.png", 1024],
  ["app/icon.png", 1024],
  ["app/apple-icon.png", 180],
  ["public/apple-icon.png", 180],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-32.png", 32],
];

for (const [rel, size] of webOuts) {
  await writeSized(light, path.join(root, rel), size);
}

await writeSized(light, path.join(ios, "AppIcon.png"), SIZE);
await writeSized(dark, path.join(ios, "AppIcon-Dark.png"), SIZE);
await writeSized(tinted, path.join(ios, "AppIcon-Tinted.png"), SIZE);
await writeSized(light, path.join(__dirname, "app-icon-light.png"), SIZE);
await writeSized(dark, path.join(__dirname, "app-icon-dark.png"), SIZE);
await writeSized(tinted, path.join(__dirname, "app-icon-tinted.png"), SIZE);

console.log("Wrote square-packed RENDO icons for web and iOS");
