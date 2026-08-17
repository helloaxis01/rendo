/** Decoded image bytes. Base64 JSON is ~4/3 this size; keep the POST under WKWebView limits. */
export const MAX_TOTAL_MEDIA_BYTES = 1_600_000;
export const MAX_IMAGE_EDGE = 1280;
export const MULTI_IMAGE_EDGE = 1280;

export function decodedBase64Bytes(base64: string): number {
  return Math.floor(base64.length * 0.75);
}

/** Split the total budget across N images so 2–4 photos cannot blow the POST. */
export function maxBytesPerImage(count: number): number {
  const n = Math.max(1, Math.min(4, Math.floor(count) || 1));
  return Math.floor(MAX_TOTAL_MEDIA_BYTES / n);
}

export function imageCompressOptions(count: number): {
  maxEdge: number;
  quality: number;
  maxBytes: number;
} {
  const n = Math.max(1, Math.min(4, Math.floor(count) || 1));
  return {
    maxEdge: n > 1 ? MULTI_IMAGE_EDGE : MAX_IMAGE_EDGE,
    quality: n > 1 ? 0.68 : 0.72,
    maxBytes: maxBytesPerImage(n),
  };
}
