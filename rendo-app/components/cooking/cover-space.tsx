"use client";

import { cn } from "@/lib/utils";

type Props = {
  coverImageUrl: string | null;
  fallbackLabel?: string | null;
  title: string;
  mode: "original" | "mine";
  onModeChange: (mode: "original" | "mine") => void;
};

export function CoverSpace({
  coverImageUrl,
  fallbackLabel,
  title,
  mode,
  onModeChange,
}: Props) {
  const showPhoto = Boolean(coverImageUrl) && mode === "original";

  return (
    <section className="relative mx-4 aspect-[4/3] overflow-hidden rounded-[20px] bg-[#E8E6E1] dark:bg-bg-surface">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl!}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-8">
          <p className="text-center text-sm font-medium tracking-wide text-text-secondary">
            {mode === "mine"
              ? "My Photo"
              : fallbackLabel?.replace(/\n/g, " ") ?? title}
          </p>
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 rounded-full bg-bg-primary/95 p-1 text-xs shadow-sm backdrop-blur-sm">
        {(
          [
            ["original", "Original Post"],
            ["mine", "My Photo"],
          ] as const
        ).map(([value, label]) => (
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
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
