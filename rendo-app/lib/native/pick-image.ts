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
