import { Capacitor } from "@capacitor/core";
import { filesystemPathCandidates } from "@/lib/native/photo-path";

export function canUseNativeCamera() {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera")
  );
}

/** Never write camera/share captures into the user's Photos library. */
export const SAVE_CAPTURES_TO_GALLERY = false;

/**
 * Single photo as a data URL held in the capture session.
 * pickImages webPaths cannot be fetched from RENDO's remote WebView.
 */
export async function pickNativeImage(
  source: "camera" | "library"
): Promise<File> {
  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );
  await Camera.requestPermissions({
    permissions: source === "camera" ? ["camera"] : ["photos"],
  });
  const photo = await Camera.getPhoto({
    quality: 85,
    width: 1600,
    height: 1600,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source:
      source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    correctOrientation: true,
    saveToGallery: SAVE_CAPTURES_TO_GALLERY,
  });
  const dataUrl = photo.dataUrl;
  if (!dataUrl) {
    throw new Error("Couldn't read that photo. Try again.");
  }
  return dataUrlToFile(dataUrl, "capture.jpg");
}

/**
 * Select up to `maxCount` photos from the library in one picker session.
 */
export async function pickNativeImages(maxCount: number): Promise<File[]> {
  if (maxCount <= 0) return [];

  const { Camera, MediaType } = await import("@capacitor/camera");
  await Camera.requestPermissions({ permissions: ["photos"] });

  if (
    typeof Camera.chooseFromGallery === "function" &&
    Capacitor.isPluginAvailable("Camera")
  ) {
    const { results } = await Camera.chooseFromGallery({
      allowMultipleSelection: true,
      limit: maxCount,
      quality: 85,
      targetWidth: 1600,
      targetHeight: 1600,
      correctOrientation: true,
    });
    return await filesFromMediaResults(results, maxCount, MediaType.Photo);
  }

  const { photos } = await Camera.pickImages({
    quality: 85,
    width: 1600,
    height: 1600,
    correctOrientation: true,
    limit: maxCount,
  });
  return await filesFromGalleryPhotos(photos, maxCount);
}

export function isImagePickCanceled(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /cancel|dismiss|no image|user cancelled/i.test(message);
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mime = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  return base64ToFile(base64, name, mime);
}

function base64ToFile(base64: string, name: string, mime: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: mime });
}

function mimeForFormat(format: string | undefined): string {
  const f = (format ?? "jpeg").toLowerCase();
  if (f === "png") return "image/png";
  if (f === "gif") return "image/gif";
  return "image/jpeg";
}

function thumbnailToFile(
  thumbnail: string,
  index: number,
  format?: string
): File {
  const mime = mimeForFormat(format);
  const dataUrl = thumbnail.startsWith("data:")
    ? thumbnail
    : `data:${mime};base64,${thumbnail}`;
  const ext = mime === "image/png" ? "png" : "jpg";
  return dataUrlToFile(dataUrl, `capture-${index + 1}.${ext}`);
}

async function readUriAsFile(uri: string, index: number): Promise<File> {
  const { Filesystem } = await import("@capacitor/filesystem");
  for (const path of filesystemPathCandidates(uri)) {
    try {
      const { data } = await Filesystem.readFile({ path });
      let base64: string;
      if (typeof data === "string") {
        base64 = data;
      } else {
        const bytes = new Uint8Array(await data.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
      }
      const lower = uri.toLowerCase();
      const mime = lower.includes(".png") ? "image/png" : "image/jpeg";
      const ext = mime === "image/png" ? "png" : "jpg";
      return base64ToFile(base64, `capture-${index + 1}.${ext}`, mime);
    } catch {
      // try next path candidate
    }
  }
  throw new Error("Couldn't read that photo. Try again.");
}

async function filesFromMediaResults(
  results: Array<{
    type: number;
    uri?: string;
    thumbnail?: string;
    metadata?: { format?: string };
  }>,
  maxCount: number,
  photoType: number
): Promise<File[]> {
  const files: File[] = [];
  for (const result of results) {
    if (files.length >= maxCount) break;
    if (result.type !== photoType) continue;
    if (result.thumbnail) {
      files.push(
        thumbnailToFile(result.thumbnail, files.length, result.metadata?.format)
      );
      continue;
    }
    if (result.uri) {
      files.push(await readUriAsFile(result.uri, files.length));
    }
  }
  return files;
}

async function filesFromGalleryPhotos(
  photos: Array<{ path?: string; webPath?: string }>,
  maxCount: number
): Promise<File[]> {
  const files: File[] = [];
  for (const photo of photos) {
    if (files.length >= maxCount) break;
    const uri = photo.path?.trim() || photo.webPath?.trim();
    if (!uri) continue;
    files.push(await readUriAsFile(uri, files.length));
  }
  return files;
}
