import { Capacitor } from "@capacitor/core";
import {
  canFetchGalleryWebPath,
  filesystemPathCandidates,
} from "@/lib/native/photo-path";

export function canUseNativeCamera() {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera")
  );
}

export function canPickNativeGallery() {
  return canUseNativeCamera() && Capacitor.isPluginAvailable("Filesystem");
}

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
    quality: 72,
    width: 1600,
    height: 1600,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source:
      source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    correctOrientation: true,
    saveToGallery: false,
  });
  const dataUrl = photo.dataUrl;
  if (!dataUrl) {
    throw new Error("Couldn't read that photo. Try again.");
  }
  return dataUrlToFile(dataUrl, "capture.jpg");
}

/**
 * Multi-select via the native gallery. Bytes are read through Filesystem —
 * never fetch(webPath), which fails in the remote Netlify WebView.
 */
export async function pickRecipeScreenshots(limit = 4): Promise<File[]> {
  const max = Math.min(4, Math.max(1, limit));
  if (!canPickNativeGallery()) {
    throw new Error("native-gallery-unavailable");
  }
  return pickNativeGalleryPhotos(max);
}

async function pickNativeGalleryPhotos(max: number): Promise<File[]> {
  const { Camera } = await import("@capacitor/camera");
  await Camera.requestPermissions({ permissions: ["photos"] });
  const gallery = await Camera.pickImages({
    quality: 72,
    width: 1600,
    height: 1600,
    limit: max,
    correctOrientation: true,
  });
  const files: File[] = [];
  for (const [index, photo] of (gallery.photos ?? []).slice(0, max).entries()) {
    files.push(
      await nativePhotoToFile(photo, `screenshot-${index + 1}.jpg`)
    );
  }
  return files;
}

async function nativePhotoToFile(
  photo: { path?: string; webPath?: string; format?: string },
  name: string
): Promise<File> {
  const nativePath = photo.path;
  if (!nativePath) {
    throw new Error("Couldn't read those photos. Try again.");
  }

  const { Filesystem } = await import("@capacitor/filesystem");
  const errors: string[] = [];
  for (const path of filesystemPathCandidates(nativePath)) {
    try {
      const result = await Filesystem.readFile({ path });
      const file = fileFromFilesystemData(result.data, photo.format, name);
      if (file) return file;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "read failed");
    }
  }

  if (canFetchGalleryWebPath() && photo.webPath) {
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    return new File([blob], name, {
      type: blob.type || `image/${photo.format || "jpeg"}`,
    });
  }

  throw new Error(
    errors[0]
      ? "Couldn't read those photos. Try again."
      : "Couldn't read those photos. Try again."
  );
}

function fileFromFilesystemData(
  raw: unknown,
  format: string | undefined,
  name: string
): File | null {
  if (typeof raw === "string" && raw.length > 0) {
    const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
    const mime =
      format === "png"
        ? "image/png"
        : format === "gif"
          ? "image/gif"
          : "image/jpeg";
    return dataUrlToFile(`data:${mime};base64,${base64}`, name);
  }
  if (typeof Blob !== "undefined" && raw instanceof Blob) {
    return new File([raw], name, {
      type: raw.type || `image/${format || "jpeg"}`,
    });
  }
  return null;
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

function dataUrlToFile(dataUrl: string, name: string): File {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mime = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: mime });
}
