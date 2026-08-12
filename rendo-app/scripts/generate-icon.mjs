/**
 * Generate RENDO app icons: real Syne ExtraBold + thick squiggles.
 * Run: node scripts/generate-icon.mjs
 *
 * Requires: npm i -D @napi-rs/canvas (or npm i --no-save @napi-rs/canvas)
 * Font: scripts/.fonts/Syne-ExtraBold.ttf (Syne weight 800 from Google Fonts)
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

function drawSquiggle(ctx, y, width, amp, phase, stroke) {
  const x0 = (SIZE - width) / 2;
  const x1 = x0 + width;
  ctx.beginPath();
  ctx.lineWidth = stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#FFFFFF";

  const steps = 80;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const wobble =
      Math.sin(t * Math.PI * 2.4 + phase) * amp +
      Math.sin(t * Math.PI * 4.8 + phase * 1.6) * (amp * 0.45) +
      Math.sin(t * Math.PI * 0.85 + phase * 0.3) * (amp * 0.25) +
      Math.sin(t * Math.PI * 10.5 + phase * 2.4) * (amp * 0.1);
    const yy = y + wobble;
    if (i === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
}

function renderIcon() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 172px Syne";

  const word = "RENDO";
  const letterGap = 4;
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const total =
    widths.reduce((a, b) => a + b, 0) + letterGap * (word.length - 1);
  let x = SIZE / 2 - total / 2;
  const midY = SIZE / 2 + 4;
  for (let i = 0; i < word.length; i += 1) {
    const w = widths[i];
    ctx.fillText(word[i], x + w / 2, midY);
    x += w + letterGap;
  }

  const markWidth = Math.min(total + 16, SIZE * 0.76);
  // Pre-subtle marker weight
  const stroke = 36;
  const amp = 17;
  const gap = 54;

  drawSquiggle(ctx, midY - 182, markWidth, amp, 0.12, stroke);
  drawSquiggle(ctx, midY - 182 + gap, markWidth, amp * 0.9, 1.6, stroke);
  drawSquiggle(ctx, midY + 158, markWidth, amp * 0.95, 2.3, stroke);
  drawSquiggle(ctx, midY + 158 + gap, markWidth, amp, 0.65, stroke);

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

console.log("Wrote icon set with Syne ExtraBold + thicker squiggles");
