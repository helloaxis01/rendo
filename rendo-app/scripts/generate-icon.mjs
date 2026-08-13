/**
 * Resize the master app icon (scripts/app-icon-source.png) for web + iOS.
 *
 * Run: npm run icon:generate
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(__dirname, "app-icon-source.png");

const SIZE = 1024;
const BG = "#000000";

function coverDraw(ctx, image, size) {
  const scale = Math.max(size / image.width, size / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
}

async function writePng(buf, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

const source = await loadImage(sourcePath);
const master = createCanvas(SIZE, SIZE);
const mctx = master.getContext("2d");
mctx.fillStyle = BG;
mctx.fillRect(0, 0, SIZE, SIZE);
mctx.imageSmoothingEnabled = true;
mctx.imageSmoothingQuality = "high";
coverDraw(mctx, source, SIZE);
const masterPng = await master.encode("png");

const outs = [
  ["public/icon.png", 1024],
  ["app/icon.png", 1024],
  ["app/apple-icon.png", 180],
  ["public/apple-icon.png", 180],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-32.png", 32],
  ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024],
];

for (const [rel, size] of outs) {
  if (size === SIZE) {
    await writePng(masterPng, path.join(root, rel));
    continue;
  }
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(master, 0, 0, size, size);
  await writePng(await c.encode("png"), path.join(root, rel));
}

console.log("Wrote wavy RENDO icon set for web and iOS");
