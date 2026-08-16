"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CookingBackButton } from "@/components/cooking/cooking-header";
import { CoverPhoto } from "@/components/cover/cover-photo";
import { TypeCover } from "@/components/cover/type-cover";
import { RecipeSubtitle } from "@/components/cooking/recipe-subtitle";
import { isUsableImageUrl } from "@/lib/cover";
import {
  canUseNativeCamera,
  isImagePickCanceled,
  pickNativeImage,
} from "@/lib/native/pick-image";

export type CoverDisplayMode = "photo" | "type" | "mine";

type Props = {
  recipeId: string;
  coverImageUrl: string | null;
  userCoverImageUrl?: string | null;
  coverImagePosition?: string | null;
  userCoverImagePosition?: string | null;
  fallbackLabel?: string | null;
  subtitle?: string | null;
  onSubtitleSave?: (next: string | null) => Promise<void>;
  mode: CoverDisplayMode;
  onModeChange: (mode: CoverDisplayMode) => void;
  onUserPhotoUpload?: (dataUrl: string) => void | Promise<void>;
  onPositionChange?: (
    which: "photo" | "mine",
    position: string
  ) => void | Promise<void>;
  topRight?: ReactNode;
};

const MAX_IMAGE_EDGE = 1600;
const TAP_MOVE_PX = 8;

function parsePosition(raw?: string | null): { x: number; y: number } {
  const match = (raw ?? "50% 50%").match(/([\d.]+)%\s+([\d.]+)%/);
  if (!match) return { x: 50, y: 50 };
  return {
    x: Math.min(100, Math.max(0, Number(match[1]))),
    y: Math.min(100, Math.max(0, Number(match[2]))),
  };
}

export function CoverSpace({
  recipeId,
  coverImageUrl,
  userCoverImageUrl,
  coverImagePosition,
  userCoverImagePosition,
  fallbackLabel,
  subtitle,
  onSubtitleSave,
  mode,
  onModeChange,
  onUserPhotoUpload,
  onPositionChange,
  topRight,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sourceFailed, setSourceFailed] = useState(false);
  const [userFailed, setUserFailed] = useState(false);
  const showSourcePhoto =
    mode === "photo" && isUsableImageUrl(coverImageUrl) && !sourceFailed;
  const showUserPhoto =
    mode === "mine" && isUsableImageUrl(userCoverImageUrl) && !userFailed;
  const showingPhoto = showSourcePhoto || showUserPhoto;


  const storedPos = parsePosition(
    mode === "mine" ? userCoverImagePosition : coverImagePosition
  );
  const [pos, setPos] = useState(storedPos);
  const posRef = useRef(storedPos);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const next = parsePosition(
      mode === "mine" ? userCoverImagePosition : coverImagePosition
    );
    posRef.current = next;
    setPos(next);
    setSourceFailed(false);
    setUserFailed(false);
  }, [
    mode,
    coverImagePosition,
    userCoverImagePosition,
    coverImageUrl,
    userCoverImageUrl,
  ]);

  function updatePos(next: { x: number; y: number }) {
    posRef.current = next;
    setPos(next);
  }

  async function handleFileChange(file: File | undefined) {
    if (!file || !onUserPhotoUpload) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      await onUserPhotoUpload(dataUrl);
      updatePos({ x: 50, y: 50 });
      setEditing(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn’t upload that photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function pickCover() {
    if (!onUserPhotoUpload || uploading) return;
    if (canUseNativeCamera()) {
      setUploading(true);
      try {
        const file = await pickNativeImage("library");
        await handleFileChange(file);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          alert(err instanceof Error ? err.message : "Couldn’t open photos.");
        }
        setUploading(false);
      }
      return;
    }
    fileRef.current?.click();
  }

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, label")) return;
    // Leave the left edge free for iOS / WKWebView swipe-back.
    if (e.clientX <= 32) return;
    if (editing && showingPhoto) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (dist > TAP_MOVE_PX) drag.moved = true;
    if (!editing || !showingPhoto || !drag.moved) return;
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * 100;
    const dy = ((e.clientY - drag.startY) / rect.height) * 100;
    updatePos({
      x: Math.min(100, Math.max(0, drag.originX - dx)),
      y: Math.min(100, Math.max(0, drag.originY - dy)),
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }

    if (!drag.moved) {
      setEditing((v) => !v);
      return;
    }

    if (!editing || !showingPhoto) return;
    const current = posRef.current;
    const next = `${current.x.toFixed(1)}% ${current.y.toFixed(1)}%`;
    const which = mode === "mine" ? "mine" : "photo";
    void onPositionChange?.(which, next);
  }

  return (
    <section
      ref={frameRef}
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden border-0 bg-transparent leading-none",
        editing && showingPhoto && "cursor-grab active:cursor-grabbing touch-none"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {showSourcePhoto ? (
        <CoverPhoto
          src={coverImageUrl!}
          position={`${pos.x}% ${pos.y}%`}
          className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover"
          onUnavailable={() => setSourceFailed(true)}
        />
      ) : showUserPhoto ? (
        <CoverPhoto
          src={userCoverImageUrl!}
          position={`${pos.x}% ${pos.y}%`}
          className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover"
          onUnavailable={() => setUserFailed(true)}
        />
      ) : mode === "photo" || mode === "mine" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <p className="px-6 text-center font-display text-[13px] tracking-[0.18em] text-white/80 sm:text-sm">
            NO PHOTO AVAILABLE
          </p>
        </div>
      ) : (
        <TypeCover
          recipeId={recipeId}
          label={subtitle?.trim() || ""}
          emptyHint="Add your own About here"
          className="p-8"
          footer={
            onSubtitleSave ? (
              <RecipeSubtitle
                value={subtitle}
                iconOnly
                onSave={onSubtitleSave}
              />
            ) : null
          }
        />
      )}

      <CookingBackButton className="absolute left-2 top-2 z-30" />

      {topRight ? (
        <div className="absolute right-3 top-3 z-20">
          {topRight}
        </div>
      ) : null}

      {editing && (
        <>
          {showingPhoto && (
            <p className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[10px] font-medium tracking-wide text-white backdrop-blur-sm">
              Drag to reposition
            </p>
          )}

          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 rounded-full bg-bg-primary/95 p-1 text-xs shadow-sm backdrop-blur-sm">
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
                disabled={value === "mine" && uploading}
                onClick={() => {
                  if (value === "mine") {
                    onModeChange("mine");
                    void pickCover();
                    return;
                  }
                  onModeChange(value);
                }}
                className={cn(
                  "rounded-full px-3.5 py-2 whitespace-nowrap transition-colors",
                  mode === value
                    ? "bg-text-primary text-bg-primary"
                    : "text-text-primary"
                )}
              >
                {value === "mine" && uploading ? "Uploading…" : optionLabel}
              </button>
            ))}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFileChange(e.target.files?.[0])}
      />
    </section>
  );
}

async function compressImageToDataUrl(file: File): Promise<string> {
  if (
    !file.type.startsWith("image/") &&
    !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
  ) {
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
