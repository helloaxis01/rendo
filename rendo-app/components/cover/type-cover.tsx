import { typeCoverStyle, type TypeCoverStyle } from "@/lib/type-cover-color";
import { cn } from "@/lib/utils";

type Props = {
  recipeId: string;
  label: string;
  style?: TypeCoverStyle | null;
  className?: string;
  textClassName?: string;
};

export function TypeCover({
  recipeId,
  label,
  style,
  className,
  textClassName,
}: Props) {
  const resolved = style ?? typeCoverStyle(recipeId);
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center p-4 text-center",
        className
      )}
      style={{
        backgroundColor: resolved.backgroundColor,
        color: resolved.color,
      }}
      aria-hidden
    >
      <span
        className={cn(
          "font-display whitespace-pre-line leading-tight tracking-wider",
          textClassName
        )}
      >
        {label}
      </span>
    </div>
  );
}
