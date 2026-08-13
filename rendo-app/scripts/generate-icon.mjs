/**
 * Generate RENDO app icons to match the Library header logo:
 * Syne ExtraBold, tracking-tight, centered word with matching double rules.
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
const TRACKING_EM = -0.01;
const SIDE_PAD = Math.round(SIZE * 0.24);
const RULE_THICKNESS = 12;
const RULE_PAIR_GAP = 20;
const RULE_TO_WORD = 78;

function measureWord(ctx, word, fontSize) {
  ctx.font = `800 ${fontSize}px Syne`;
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const gaps = widths.slice(0, -1).map((w) => w * TRACKING_EM);
  const total =
    widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  return { widths, gaps, total };
}

function renderIcon() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#F6F7F8";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const word = "RENDO";
  const maxWordWidth = SIZE - SIDE_PAD * 2;
  let fontSize = 128;
  let metrics = measureWord(ctx, word, fontSize);
  while (metrics.total > maxWordWidth && fontSize > 64) {
    fontSize -= 2;
    metrics = measureWord(ctx, word, fontSize);
  }

  ctx.font = `800 ${fontSize}px Syne`;
  const glyph = ctx.measureText(word);
  const ascent = glyph.actualBoundingBoxAscent || Math.round(fontSize * 0.72);
  const descent = glyph.actualBoundingBoxDescent || Math.round(fontSize * 0.02);
  const wordBlock = ascent + descent;
  const rulesBlock = RULE_THICKNESS * 2 + RULE_PAIR_GAP;
  const stack =
    rulesBlock + RULE_TO_WORD + wordBlock + RULE_TO_WORD + rulesBlock;
  const stackTop = Math.round((SIZE - stack) / 2);
  const wordTop = stackTop + rulesBlock + RULE_TO_WORD;
  const midY = wordTop + ascent;
  const ruleWidth = Math.round(metrics.total);
  const ruleX = Math.round((SIZE - ruleWidth) / 2);

  ctx.fillStyle = "#0A0A0A";

  function drawPair(top) {
    const y1 = Math.round(top);
    const y2 = Math.round(top + RULE_THICKNESS + RULE_PAIR_GAP);
    ctx.fillRect(ruleX, y1, ruleWidth, RULE_THICKNESS);
    ctx.fillRect(ruleX, y2, ruleWidth, RULE_THICKNESS);
  }

  drawPair(stackTop);
  drawPair(wordTop + wordBlock + RULE_TO_WORD);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${fontSize}px Syne`;

  let x = SIZE / 2 - metrics.total / 2;
  for (let i = 0; i < word.length; i += 1) {
    const w = metrics.widths[i];
    ctx.fillText(word[i], x + w / 2, midY);
    x += w + (metrics.gaps[i] ?? 0);
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
  ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024],
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

console.log(
  "Wrote icon set: Syne ExtraBold RENDO with matching double rules"
);
