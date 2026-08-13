type Props = {
  servings?: number | null;
  minutes?: number | null;
  ingredientCount?: number | null;
};

function segment(parts: string[]) {
  return parts.filter(Boolean);
}

export function RecipeMetaBar({
  servings,
  minutes,
  ingredientCount,
}: Props) {
  const parts = segment([
    servings && servings > 0
      ? `${servings} serving${servings === 1 ? "" : "s"}`
      : "",
    minutes && minutes > 0 ? `${minutes} min` : "",
    ingredientCount && ingredientCount > 0
      ? `${ingredientCount} ingredient${ingredientCount === 1 ? "" : "s"}`
      : "",
  ]);

  if (!parts.length) return null;

  return (
    <p className="px-4 pt-1.5 text-[13px] leading-snug text-text-secondary">
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? (
            <span className="px-1.5 text-text-secondary/50" aria-hidden>
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </p>
  );
}
