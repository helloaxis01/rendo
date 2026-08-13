import { typeCoverStyle, type TypeCoverStyle } from "@/lib/type-cover-color";
import type { TypeCoverHint } from "@/lib/type-cover-hint";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  recipeId: string;
  label: string;
  hint?: TypeCoverHint | null;
  style?: TypeCoverStyle | null;
  className?: string;
  textClassName?: string;
  footer?: ReactNode;
};

export function TypeCover({
  recipeId,
  label,
  hint,
  style,
  className,
  textClassName,
  footer,
}: Props) {
  const resolved = style ?? typeCoverStyle(recipeId, hint);
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center overflow-hidden p-4 text-center",
        className
      )}
      style={{
        backgroundColor: resolved.backgroundColor,
        color: resolved.color,
      }}
    >
      <div
        className="pointer-events-none absolute inset-[-30%] scale-110 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url("${resolved.image}")` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: resolved.backgroundImage }}
        aria-hidden
      />
      <span
        className={cn(
          "relative z-10 max-w-[16ch] whitespace-normal leading-[1.15]",
          textClassName
        )}
        style={{
          fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif",
          fontWeight: resolved.fontWeight,
          letterSpacing: resolved.letterSpacing,
          transform: `scaleX(${resolved.scaleX})`,
        }}
        aria-hidden
      >
        {label}
      </span>
      {footer ? <div className="relative z-10">{footer}</div> : null}
    </div>
  );
}
