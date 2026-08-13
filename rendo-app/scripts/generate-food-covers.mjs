/**
 * Blur food close-ups into smooth color washes and sample palettes.
 * Run: npm run covers:food
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceDir = path.join(__dirname, "food-sources");
const outDir = path.join(root, "public", "covers", "food");
const manifestPath = path.join(root, "lib", "type-cover-food.ts");

const OUT = 512;
const BLUR = 72;

function hex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function rgbToHue(r, g, b) {
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

function luminance(r, g, b) {
  const toLinear = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function sample(data, width, height, x, y) {
  const sx = Math.min(width - 1, Math.max(0, Math.round(x)));
  const sy = Math.min(height - 1, Math.max(0, Math.round(y)));
  const i = (sy * width + sx) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function average(data, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = width * height;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / n, g: g / n, b: b / n };
}

function boxBlurPass(src, w, h, radius) {
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  const rs = radius * 2 + 1;

  for (let y = 0; y < h; y += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const row = y * w;
    for (let k = -radius; k <= radius; k += 1) {
      const x = Math.min(w - 1, Math.max(0, k));
      const i = (row + x) * 4;
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      a += src[i + 3];
    }
    for (let x = 0; x < w; x += 1) {
      const o = (row + x) * 4;
      tmp[o] = r / rs;
      tmp[o + 1] = g / rs;
      tmp[o + 2] = b / rs;
      tmp[o + 3] = a / rs;
      const leave = Math.min(w - 1, Math.max(0, x - radius));
      const enter = Math.min(w - 1, Math.max(0, x + radius + 1));
      const li = (row + leave) * 4;
      const ei = (row + enter) * 4;
      r += src[ei] - src[li];
      g += src[ei + 1] - src[li + 1];
      b += src[ei + 2] - src[li + 2];
      a += src[ei + 3] - src[li + 3];
    }
  }

  for (let x = 0; x < w; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const y = Math.min(h - 1, Math.max(0, k));
      const i = (y * w + x) * 4;
      r += tmp[i];
      g += tmp[i + 1];
      b += tmp[i + 2];
      a += tmp[i + 3];
    }
    for (let y = 0; y < h; y += 1) {
      const o = (y * w + x) * 4;
      out[o] = r / rs;
      out[o + 1] = g / rs;
      out[o + 2] = b / rs;
      out[o + 3] = a / rs;
      const leave = Math.min(h - 1, Math.max(0, y - radius));
      const enter = Math.min(h - 1, Math.max(0, y + radius + 1));
      const li = (leave * w + x) * 4;
      const ei = (enter * w + x) * 4;
      r += tmp[ei] - tmp[li];
      g += tmp[ei + 1] - tmp[li + 1];
      b += tmp[ei + 2] - tmp[li + 2];
      a += tmp[ei + 3] - tmp[li + 3];
    }
  }

  return out;
}

function gaussianBlur(imageData, radius) {
  let pixels = new Uint8ClampedArray(imageData.data);
  const { width, height } = imageData;
  const passes = 3;
  for (let i = 0; i < passes; i += 1) {
    pixels = boxBlurPass(pixels, width, height, radius);
  }
  imageData.data.set(pixels);
}

function drawCovered(ctx, image, x, y, size) {
  const scale = Math.max(size / image.width, size / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
}

async function processFile(file) {
  const id = path.basename(file, path.extname(file)).replace(/^food-/, "");
  const image = await loadImage(path.join(sourceDir, file));
  const pad = BLUR * 2;
  const work = createCanvas(OUT + pad * 2, OUT + pad * 2);
  const ctx = work.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawCovered(ctx, image, 0, 0, OUT + pad * 2);

  let usedFilter = false;
  try {
    ctx.filter = `blur(${BLUR}px)`;
    ctx.drawImage(work, 0, 0);
    usedFilter = ctx.filter !== "none";
  } catch {
    usedFilter = false;
  }

  if (!usedFilter) {
    const pixels = ctx.getImageData(0, 0, work.width, work.height);
    gaussianBlur(pixels, Math.round(BLUR / 2));
    ctx.putImageData(pixels, 0, 0);
  }

  const wash = createCanvas(OUT, OUT);
  const wctx = wash.getContext("2d");
  wctx.drawImage(work, -pad, -pad);

  const sampleData = wctx.getImageData(0, 0, OUT, OUT);
  const { data, width, height } = sampleData;
  const whole = average(data, width, height);
  const c1 = sample(data, width, height, width * 0.22, height * 0.2);
  const c2 = sample(data, width, height, width * 0.5, height * 0.5);
  const c3 = sample(data, width, height, width * 0.78, height * 0.8);
  const colors = [hex(c1.r, c1.g, c1.b), hex(c2.r, c2.g, c2.b), hex(c3.r, c3.g, c3.b)];
  const lum = luminance(whole.r, whole.g, whole.b);
  const outName = `${id}.jpg`;
  await writeFile(
    path.join(outDir, outName),
    wash.toBuffer("image/jpeg", { quality: 0.92 })
  );

  return {
    id,
    src: `/covers/food/${outName}?v=2`,
    colors,
    hue: Math.round(rgbToHue(whole.r, whole.g, whole.b)),
    color: lum > 0.45 ? "#0A0A0A" : "#FAFAF8",
    backgroundColor: hex(whole.r, whole.g, whole.b),
  };
}

const files = (await readdir(sourceDir))
  .filter((name) => /\.png$/i.test(name))
  .sort();
if (!files.length) {
  throw new Error(`No food source PNGs in ${sourceDir}`);
}

await mkdir(outDir, { recursive: true });
const palettes = [];
for (const file of files) {
  palettes.push(await processFile(file));
}

const body = `/** Auto-generated by scripts/generate-food-covers.mjs — do not edit by hand. */

export type FoodCoverPalette = {
  id: string;
  src: string;
  colors: [string, string, string];
  hue: number;
  color: string;
  backgroundColor: string;
};

export const FOOD_COVER_PALETTES = ${JSON.stringify(palettes, null, 2)} as const satisfies ReadonlyArray<FoodCoverPalette>;
`;

await writeFile(manifestPath, body);
console.log(
  `Wrote ${palettes.length} food covers → public/covers/food and lib/type-cover-food.ts`
);
