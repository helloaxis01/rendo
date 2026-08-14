/**
 * Resize situational app icons for web + iOS (any / dark / tinted).
 *
 * Sources: scripts/app-icon-light.png, app-icon-dark.png, app-icon-tinted.png
 * Run: npm run icon:generate
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SIZE = 1024;

function coverDraw(ctx, image, size) {
  const scale = Math.max(size / image.width, size / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
}

function sampleBg(image) {
  const probe = createCanvas(1, 1);
  const pctx = probe.getContext("2d");
  pctx.drawImage(image, 0, 0, 1, 1);
  const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}

async function rasterize(sourcePath) {
  const image = await loadImage(sourcePath);
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = sampleBg(image);
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  coverDraw(ctx, image, SIZE);
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

const light = await rasterize(path.join(__dirname, "app-icon-light.png"));
const dark = await rasterize(path.join(__dirname, "app-icon-dark.png"));
const tinted = await rasterize(path.join(__dirname, "app-icon-tinted.png"));

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

const ios = path.join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset"
);
await writeSized(light, path.join(ios, "AppIcon.png"), SIZE);
await writeSized(dark, path.join(ios, "AppIcon-Dark.png"), SIZE);
await writeSized(tinted, path.join(ios, "AppIcon-Tinted.png"), SIZE);

console.log("Wrote light / dark / tinted RENDO icons for web and iOS");
