import { processImageForImport, type MediaPayload } from "@/lib/capture/prepare-media";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const MEMORY_BUCKET = "recipe-media";
const MAX_MEMORY_PHOTOS = 4;

export function maxMemoryPhotos() {
  return MAX_MEMORY_PHOTOS;
}

export function mediaPayloadToDataUrl(media: MediaPayload): string {
  return `data:${media.mimeType};base64,${media.data}`;
}

export function mediaPayloadToBytes(media: MediaPayload): Uint8Array {
  const binary = atob(media.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** WebP-compress a memory photo (color — these are keepsakes, not OCR cards). */
export async function prepareMemoryPhoto(file: File): Promise<MediaPayload> {
  return processImageForImport(file, { imageCount: 1, mode: "color" });
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Upload a compressed memory photo to Supabase Storage.
 * Path: `{userId}/{recipeId}/memories/{id}.{ext}` (RLS uses folder[1] = userId).
 */
export async function uploadMemoryPhoto(input: {
  userId: string;
  recipeId: string;
  media: MediaPayload;
  photoId?: string;
}): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;

  const photoId = input.photoId ?? crypto.randomUUID().slice(0, 12);
  const ext = extensionForMime(input.media.mimeType);
  const path = `${input.userId}/${input.recipeId}/memories/${photoId}.${ext}`;
  const bytes = mediaPayloadToBytes(input.media);

  const { error } = await client.storage
    .from(MEMORY_BUCKET)
    .upload(path, bytes, {
      contentType: input.media.mimeType,
      upsert: true,
    });
  if (error) {
    console.warn("memory photo upload failed", error.message);
    return null;
  }

  const { data } = client.storage.from(MEMORY_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Compress then upload (when signed in) or keep a local data URL.
 * Returns a stable URL suitable for `cook_events.photo_urls`.
 */
export async function resolveMemoryPhotoUrl(input: {
  file: File;
  recipeId: string;
  userId?: string | null;
}): Promise<string> {
  const media = await prepareMemoryPhoto(input.file);
  if (input.userId) {
    const remote = await uploadMemoryPhoto({
      userId: input.userId,
      recipeId: input.recipeId,
      media,
    });
    if (remote) return remote;
  }
  return mediaPayloadToDataUrl(media);
}

export function cleanPhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_MEMORY_PHOTOS) break;
  }
  return out;
}

function parseDataUrl(raw: string): { mimeType: string; data: string } | null {
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  if (match[2].length > 2_000_000) return null;
  return { mimeType: match[1], data: match[2] };
}

/** Promote local data-URL memory photos to Storage before cloud sync. */
export async function withRemoteMemoryPhotos(
  recipes: import("@/lib/db/types").Recipe[],
  userId: string
): Promise<import("@/lib/db/types").Recipe[]> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return recipes.map((recipe) => ({
      ...recipe,
      cook_events: (recipe.cook_events ?? []).map((event) => ({
        ...event,
        photo_urls: cleanPhotoUrls(event.photo_urls).filter(
          (url) => !url.startsWith("data:")
        ),
      })),
    }));
  }

  const next: import("@/lib/db/types").Recipe[] = [];
  for (const recipe of recipes) {
    const events = [];
    for (const event of recipe.cook_events ?? []) {
      const urls = cleanPhotoUrls(event.photo_urls);
      const resolved: string[] = [];
      for (const url of urls) {
        if (!url.startsWith("data:image/")) {
          resolved.push(url);
          continue;
        }
        const parsed = parseDataUrl(url);
        if (!parsed) continue;
        const remote = await uploadMemoryPhoto({
          userId,
          recipeId: recipe.id,
          media: parsed,
          photoId: crypto.randomUUID().slice(0, 12),
        });
        if (remote) resolved.push(remote);
      }
      events.push({ ...event, photo_urls: resolved });
    }
    next.push({ ...recipe, cook_events: events });
  }
  return next;
}
