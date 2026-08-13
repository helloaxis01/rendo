type Props = {
  servings?: number | null;
  minutes?: number | null;
  ingredientCount?: number | null;
};

type Stat = {
  value: string;
  label: string;
};

export function RecipeMetaBar({
  servings,
  minutes,
  ingredientCount,
}: Props) {
  const stats: Stat[] = [];
  if (servings && servings > 0) {
    stats.push({
      value: String(servings),
      label: servings === 1 ? "serving" : "servings",
    });
  }
  if (minutes && minutes > 0) {
    stats.push({
      value: String(minutes),
      label: "min",
    });
  }
  if (ingredientCount && ingredientCount > 0) {
    stats.push({
      value: String(ingredientCount),
      label: ingredientCount === 1 ? "ingredient" : "ingredients",
    });
  }

  if (!stats.length) return null;

  return (
    <div
      className="flex items-center justify-evenly gap-2 border-b border-border-hairline px-3 py-2"
      role="group"
      aria-label="Recipe snapshot"
    >
      {stats.map((stat) => (
        <p
          key={stat.label}
          className="min-w-0 truncate text-center text-[13px] leading-none text-text-secondary"
        >
          <span className="font-semibold tabular-nums text-text-primary">
            {stat.value}
          </span>
          {` ${stat.label}`}
        </p>
      ))}
    </div>
  );
}
