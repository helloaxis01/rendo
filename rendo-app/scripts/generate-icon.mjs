/**
 * Generate RENDO app icons to match the Library header logo:
 * Syne ExtraBold, tracking-tight, no decorative marks.
 *
 * Run: node scripts/generate-icon.mjs
 *
 * Requires: @napi-rs/canvas
 * Font: scripts/.fonts/Syne-ExtraBold.ttf (Syne weight 800)
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fontPath = path.join(__dirname, ".fonts", "Syne-ExtraBold.ttf");

GlobalFonts.registerFromPath(fontPath, "Syne");

const SIZE = 1024;
/** Matches .font-display letter-spacing (-0.01em) + header tracking-tight. */
const TRACKING_EM = -0.025;

function renderIcon() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  // Match app chrome: light surface + primary text (same as header logo).
  ctx.fillStyle = "#F6F7F8";
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = "#0A0A0A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 210px Syne";

  const word = "RENDO";
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const gaps = widths.slice(0, -1).map((w) => w * TRACKING_EM);
  const total =
    widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);

  let x = SIZE / 2 - total / 2;
  const midY = SIZE / 2 + 6;
  for (let i = 0; i < word.length; i += 1) {
    const w = widths[i];
    ctx.fillText(word[i], x + w / 2, midY);
    x += w + (gaps[i] ?? 0);
  }

  return canvas;
}

async function writePng(buf, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

const master = renderIcon();
const masterPng = await master.encode("png");

const outs = [
  ["public/icon.png", 1024],
  ["app/icon.png", 1024],
  ["app/apple-icon.png", 180],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-32.png", 32],
];

for (const [rel, size] of outs) {
  if (size === 1024) {
    await writePng(masterPng, path.join(root, rel));
    continue;
  }
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(master, 0, 0, size, size);
  await writePng(await c.encode("png"), path.join(root, rel));
}

console.log("Wrote icon set: Syne ExtraBold RENDO (matches header logo)");
