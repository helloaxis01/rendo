import { Capacitor } from "@capacitor/core";

export function canUseNativeCamera() {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera")
  );
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

export async function pickRecipeScreenshots(limit = 4): Promise<File[]> {
  const max = Math.min(4, Math.max(1, limit));
  if (canUseNativeCamera()) {
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
      const file = await galleryPhotoToFile(photo, `screenshot-${index + 1}.jpg`);
      if (file) files.push(file);
    }
    return files;
  }

  return pickScreenshotsFromInput(max);
}

async function galleryPhotoToFile(
  photo: { webPath?: string; format?: string },
  name: string
): Promise<File | null> {
  if (!photo.webPath) return null;
  const res = await fetch(photo.webPath);
  const blob = await res.blob();
  const type = blob.type || `image/${photo.format || "jpeg"}`;
  return new File([blob], name, { type });
}

function pickScreenshotsFromInput(max: number): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      const files = [...(input.files ?? [])].slice(0, max);
      resolve(files);
    };
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

export async function filesToExtractMedia(files: File[]): Promise<
  { mimeType: string; data: string }[]
> {
  const media: { mimeType: string; data: string }[] = [];
  for (const file of files.slice(0, 4)) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Couldn't read that photo."));
      reader.readAsDataURL(file);
    });
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match?.[1] || file.type || "image/jpeg";
    const data = match?.[2] || "";
    if (data) media.push({ mimeType, data });
  }
  return media;
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
