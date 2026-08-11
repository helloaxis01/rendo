"use client";

import { cn } from "@/lib/utils";

export type CoverDisplayMode = "photo" | "type" | "mine";

type Props = {
  coverImageUrl: string | null;
  fallbackLabel?: string | null;
  title: string;
  mode: CoverDisplayMode;
  onModeChange: (mode: CoverDisplayMode) => void;
};

export function CoverSpace({
  coverImageUrl,
  fallbackLabel,
  title,
  mode,
  onModeChange,
}: Props) {
  const label = (fallbackLabel ?? title.toUpperCase()).trim();
  const showPhoto = Boolean(coverImageUrl) && mode === "photo";

  return (
    <section className="relative mx-4 aspect-[4/3] overflow-hidden rounded-[20px] bg-[#E8E6E1] dark:bg-bg-surface">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl!}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : mode === "type" || (!coverImageUrl && mode !== "mine") ? (
        <div className="flex h-full w-full items-center justify-center bg-text-primary p-8">
          <p className="font-display whitespace-pre-line text-center text-2xl leading-tight tracking-[0.12em] text-bg-primary sm:text-3xl">
            {label}
          </p>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center p-8">
          <p className="text-center text-sm font-medium tracking-wide text-text-secondary">
            My Photo
          </p>
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 rounded-full bg-bg-primary/95 p-1 text-xs shadow-sm backdrop-blur-sm">
        {(
          [
            ["photo", "Photo"],
            ["type", "Type"],
            ["mine", "My Photo"],
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
