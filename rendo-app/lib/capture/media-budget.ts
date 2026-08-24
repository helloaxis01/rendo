import { MAX_SESSION_PHOTOS } from "@/lib/capture/photo-session";

/** Decoded image bytes. Base64 JSON is ~4/3 this size; keep the POST under WKWebView limits. */
export const MAX_TOTAL_MEDIA_BYTES = 1_600_000;
/** Soft target per Vision frame after WebP compress. */
export const TARGET_IMAGE_BYTES = 250_000;
export const MAX_IMAGE_EDGE = 1600;
export const MULTI_IMAGE_EDGE = 1600;
/** Preferred WebP quality for Vision payloads. */
export const WEBP_QUALITY = 0.8;

export function decodedBase64Bytes(base64: string): number {
  return Math.floor(base64.length * 0.75);
}

/** Split the total budget across N images so multi-photo sessions cannot blow the POST. */
export function maxBytesPerImage(count: number): number {
  const n = Math.max(
    1,
    Math.min(MAX_SESSION_PHOTOS, Math.floor(count) || 1)
  );
  return Math.floor(MAX_TOTAL_MEDIA_BYTES / n);
}

export type ImagePrepMode = "color" | "card";

export function imageCompressOptions(count: number): {
  maxEdge: number;
  quality: number;
  /** Soft target — prefer files under this size. */
  targetBytes: number;
  /** Hard ceiling for the Vision POST. */
  maxBytes: number;
} {
  const n = Math.max(
    1,
    Math.min(MAX_SESSION_PHOTOS, Math.floor(count) || 1)
  );
  const maxBytes = maxBytesPerImage(n);
  return {
    maxEdge: n > 1 ? MULTI_IMAGE_EDGE : MAX_IMAGE_EDGE,
    quality: WEBP_QUALITY,
    targetBytes: Math.min(TARGET_IMAGE_BYTES, maxBytes),
    maxBytes,
  };
}
