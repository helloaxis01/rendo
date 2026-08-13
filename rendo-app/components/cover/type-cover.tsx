import { typeCoverStyle, type TypeCoverStyle } from "@/lib/type-cover-color";
import type { TypeCoverHint } from "@/lib/type-cover-hint";
import { cn } from "@/lib/utils";

type Props = {
  recipeId: string;
  label: string;
  hint?: TypeCoverHint | null;
  style?: TypeCoverStyle | null;
  className?: string;
  textClassName?: string;
};

export function TypeCover({
  recipeId,
  label,
  hint,
  style,
  className,
  textClassName,
}: Props) {
  const resolved = style ?? typeCoverStyle(recipeId, hint);
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden p-4 text-center",
        className
      )}
      style={{
        backgroundColor: resolved.backgroundColor,
        color: resolved.color,
      }}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-[-30%] scale-110 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url("${resolved.image}")` }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: resolved.backgroundImage }}
      />
      <span
        className={cn(
          "relative z-10 font-display whitespace-pre-line leading-tight tracking-wider",
          textClassName
        )}
      >
        {label}
      </span>
    </div>
  );
}
