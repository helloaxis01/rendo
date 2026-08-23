import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  /** Single-line cover art label (recipe detail). */
  label?: string;
  /** Grid cards: ingredient-based description in the cover field. */
  description?: string;
  /** Recipe page only: shown until a subtitle is saved. */
  emptyHint?: string;
  className?: string;
  textClassName?: string;
  footer?: ReactNode;
};

/**
 * Flat index-card cover for photo-less recipes.
 * Light: parchment. Dark: near-black. No gradient / photo imitation.
 * Library cards show description only; title sits under the card like photo recipes.
 */
export function TypeCover({
  label,
  description,
  emptyHint,
  className,
  textClassName,
  footer,
}: Props) {
  const desc = (description ?? "").trim();
  const savedLabel = (label ?? "").trim();
  const shownLabel = savedLabel || emptyHint || "";
  const isHint = !savedLabel && Boolean(emptyHint);

  return (
    <div
      className={cn(
        "rendo-type-cover absolute inset-0 flex flex-col items-center justify-center overflow-hidden p-4 text-center",
        className
      )}
    >
      {desc ? (
        <span
          className={cn(
            "rendo-type-cover-desc relative z-10",
            textClassName
          )}
        >
          {desc}
        </span>
      ) : shownLabel ? (
        <span
          className={cn(
            "relative z-10 max-w-[16ch] whitespace-normal font-display text-[13.6px] font-bold leading-snug tracking-wide sm:text-[15.3px]",
            isHint && "opacity-50",
            textClassName
          )}
          aria-hidden
        >
          {shownLabel}
        </span>
      ) : null}
      {footer ? <div className="relative z-10 mt-2">{footer}</div> : null}
    </div>
  );
}
