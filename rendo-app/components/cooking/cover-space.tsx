"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

export type CoverDisplayMode = "photo" | "type" | "mine";

type Props = {
  coverImageUrl: string | null;
  userCoverImageUrl?: string | null;
  fallbackLabel?: string | null;
  title: string;
  mode: CoverDisplayMode;
  onModeChange: (mode: CoverDisplayMode) => void;
  onUserPhotoUpload?: (dataUrl: string) => void | Promise<void>;
};

const MAX_IMAGE_EDGE = 1600;

export function CoverSpace({
  coverImageUrl,
  userCoverImageUrl,
  fallbackLabel,
  title,
  mode,
  onModeChange,
  onUserPhotoUpload,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const label = (fallbackLabel ?? title.toUpperCase()).trim();
  const showSourcePhoto = Boolean(coverImageUrl) && mode === "photo";
  const showUserPhoto = Boolean(userCoverImageUrl) && mode === "mine";

  async function handleFileChange(file: File | undefined) {
    if (!file || !onUserPhotoUpload) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      await onUserPhotoUpload(dataUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn’t upload that photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="relative mx-4 aspect-[4/3] overflow-hidden rounded-[20px] bg-[#E8E6E1] dark:bg-bg-surface">
      {showSourcePhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl!}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : showUserPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={userCoverImageUrl!}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : mode === "type" || mode === "photo" ? (
        <div className="flex h-full w-full items-center justify-center bg-text-primary p-8">
          <p className="font-display whitespace-pre-line text-center text-2xl leading-tight tracking-[0.12em] text-bg-primary sm:text-3xl">
            {label}
          </p>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8">
          <button
            type="button"
            disabled={uploading || !onUserPhotoUpload}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-3 text-sm font-medium text-bg-primary disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload Photo"}
          </button>
          <p className="text-center text-xs text-text-secondary">
            Add your own photo of this dish
          </p>
        </div>
      )}

      {mode === "mine" && showUserPhoto && (
        <button
          type="button"
          disabled={uploading || !onUserPhotoUpload}
          onClick={() => fileRef.current?.click()}
          className="absolute right-3 top-3 rounded-full bg-bg-primary/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Replace"}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFileChange(e.target.files?.[0])}
      />

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 rounded-full bg-bg-primary/95 p-1 text-xs shadow-sm backdrop-blur-sm">
        {(
          [
            ["photo", "Photo"],
            ["type", "Type"],
            ["mine", "Upload Photo"],
          ] as const
        ).map(([value, optionLabel]) => (
          <button
            key={value}
            type="button"
            onClick={() => onModeChange(value)}
            className={cn(
              "rounded-full px-3.5 py-2 whitespace-nowrap transition-colors",
              mode === value
                ? "bg-text-primary text-bg-primary"
                : "text-text-primary"
            )}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </section>
  );
}

async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error("Please choose an image file.");
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    if (dataUrl.length > 2_500_000) {
      throw new Error("Photo is too large after compression. Try another image.");
    }
    return dataUrl;
  } catch (err) {
    if (err instanceof Error && err.message.includes("too large")) throw err;
    // Fallback: read as data URL without canvas (may fail for HEIC)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        if (!result.startsWith("data:image/")) {
          reject(new Error("Couldn’t read that image."));
          return;
        }
        if (result.length > 2_500_000) {
          reject(new Error("Photo is too large. Try a smaller image."));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(new Error("Couldn’t read that image."));
      reader.readAsDataURL(file);
    });
  }
}
