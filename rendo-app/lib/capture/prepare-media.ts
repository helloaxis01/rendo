import {
  decodedBase64Bytes,
  imageCompressOptions,
  MAX_TOTAL_MEDIA_BYTES,
  type ImagePrepMode,
} from "@/lib/capture/media-budget";

export type MediaPayload = {
  mimeType: string;
  data: string;
};

export type ProcessImageOptions = {
  imageCount?: number;
  /** High-contrast grayscale for index cards / cookbook scans. */
  mode?: ImagePrepMode;
};

/**
 * Client-side prep before Vision AI or cloud upload:
 * downscale ≤1600px longest edge, WebP @ ~80% (<250KB soft target),
 * optional card grayscale for handwriting/OCR.
 */
export async function processImageForImport(
  file: File,
  options: ProcessImageOptions = {}
): Promise<MediaPayload> {
  return fileToCompressedImageMedia(
    file,
    options.imageCount ?? 1,
    options.mode ?? "color"
  );
}

export async function prepareFile(
  file: File,
  treatAsImage = false,
  imageCount = 1,
  mode: ImagePrepMode = "color"
): Promise<{
  payload: string;
  media: MediaPayload | null;
}> {
  const mime = file.type || guessMime(file.name);

  if (treatAsImage || mime.startsWith("image/")) {
    const media = await processImageForImport(file, { imageCount, mode });
    return {
      payload: `IMAGE FILE: ${file.name || "capture.webp"} (${media.mimeType})`,
      media,
    };
  }

  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const data = await fileToBase64(file);
    if (decodedBase64Bytes(data) > MAX_TOTAL_MEDIA_BYTES) {
      throw new Error(
        "PDF is too large (max ~3MB). Try a smaller file or paste text."
      );
    }
    return {
      payload: `PDF FILE: ${file.name}`,
      media: { mimeType: "application/pdf", data },
    };
  }

  const text = await file.text();
  const clipped = text.trim().slice(0, 40000);
  if (!clipped) {
    throw new Error("That file looks empty. Try another file or paste text.");
  }
  return {
    payload: `FILE: ${file.name}\n\n${clipped}`,
    media: null,
  };
}

export function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) reject(new Error("Couldn’t read file data"));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Couldn’t read file"));
    reader.readAsDataURL(file);
  });
}

export async function fileToCompressedImageMedia(
  file: File,
  imageCount = 1,
  mode: ImagePrepMode = "color"
): Promise<MediaPayload> {
  const options = imageCompressOptions(imageCount);
  const mime = file.type || guessMime(file.name) || "image/jpeg";
  const alreadyWebp = /webp/i.test(mime);
  // Already a small WebP and no card filter — skip re-encode.
  if (
    mode === "color" &&
    alreadyWebp &&
    file.size > 0 &&
    file.size <= options.targetBytes
  ) {
    const data = await fileToBase64(file);
    return { mimeType: "image/webp", data };
  }
  try {
    return await compressImage(file, { ...options, mode });
  } catch {
    const data = await fileToBase64(file);
    if (decodedBase64Bytes(data) > options.maxBytes) {
      throw new Error(
        "Image is too large (max ~3MB). Try a closer, clearer photo."
      );
    }
    if (/heic|heif/i.test(mime)) {
      throw new Error(
        "Couldn't read that photo format. Take a new photo or use a screenshot."
      );
    }
    return {
      mimeType: /webp/i.test(mime)
        ? "image/webp"
        : /jpe?g/i.test(mime)
          ? "image/jpeg"
          : mime,
      data,
    };
  }
}

function applyCardGrayscale(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    // Mild contrast stretch for handwriting / print on cards.
    y = Math.min(255, Math.max(0, (y - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

async function compressImage(
  file: File,
  options: {
    maxEdge: number;
    quality: number;
    targetBytes: number;
    maxBytes: number;
    mode: ImagePrepMode;
  }
): Promise<MediaPayload> {
  const bitmap = await decodeImage(file);
  const scale = Math.min(
    1,
    options.maxEdge / Math.max(bitmap.width, bitmap.height)
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap.image, 0, 0, width, height);
  if (options.mode === "card") {
    applyCardGrayscale(ctx, width, height);
  }
  bitmap.close();

  const formats: Array<{ type: "image/webp" | "image/jpeg"; name: string }> = [
    { type: "image/webp", name: "capture.webp" },
    { type: "image/jpeg", name: "capture.jpg" },
  ];
  const qualities = [options.quality, 0.7, 0.55, 0.42];

  let bestUnderMax: MediaPayload | null = null;

  for (const format of formats) {
    for (const quality of qualities) {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), format.type, quality)
      );
      if (!blob) continue;
      if (blob.size > options.maxBytes) continue;
      const data = await fileToBase64(
        new File([blob], format.name, { type: format.type })
      );
      const payload: MediaPayload = { mimeType: format.type, data };
      if (blob.size <= options.targetBytes) {
        return payload;
      }
      if (!bestUnderMax || blob.size < decodedBase64Bytes(bestUnderMax.data)) {
        bestUnderMax = payload;
      }
    }
  }

  if (bestUnderMax) return bestUnderMax;
  throw new Error("Image is still too large after compression.");
}

async function decodeImage(file: File): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("Couldn’t decode that photo"));
        img.src = url;
      });
      return {
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(
        "Couldn't read that photo. Take a new photo or use a screenshot."
      );
    }
  }
}
