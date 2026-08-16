import { typeCoverStyle } from "@/lib/type-cover-color";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

type Props = {
  recipeId: string;
  label: string;
  /** Recipe page only: shown until a subtitle is saved. Never used on the home grid. */
  emptyHint?: string;
  className?: string;
  textClassName?: string;
  footer?: ReactNode;
};

export function TypeCover({
  recipeId,
  label,
  emptyHint,
  className,
  textClassName,
  footer,
}: Props) {
  const type = typeCoverStyle(recipeId);
  const saved = label.trim();
  const shown = saved || emptyHint || "";
  const isHint = !saved && Boolean(emptyHint);

  return (
    <div
      className={cn(
        "rendo-type-cover absolute inset-0 flex flex-col items-center justify-center overflow-hidden p-4 text-center",
        className
      )}
      style={{ "--rendo-cover-accent": type.accent } as CSSProperties}
    >
      <span
        className={cn(
          "relative z-10 max-w-[16ch] whitespace-normal text-base font-bold leading-snug sm:text-lg",
          isHint && "opacity-50",
          textClassName
        )}
        style={{
          fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif",
          fontWeight: 700,
          letterSpacing: isHint ? "0.02em" : type.letterSpacing,
          transform: isHint ? undefined : `scaleX(${type.scaleX})`,
        }}
        aria-hidden
      >
        {shown}
      </span>
      {footer ? <div className="relative z-10">{footer}</div> : null}
    </div>
  );
}
