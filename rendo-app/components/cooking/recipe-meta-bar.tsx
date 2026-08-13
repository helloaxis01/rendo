type Stat = {
  value: string;
  label: string;
};

type Props = {
  servings?: number | null;
  minutes?: number | null;
  ingredientCount?: number | null;
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
      className="border-b border-border-hairline px-2 py-2.5"
      role="group"
      aria-label="Recipe snapshot"
    >
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-w-0 flex-col items-center justify-center px-2 py-0.5 text-center"
          >
            <span className="font-display text-[20px] leading-none tabular-nums tracking-tight text-text-primary sm:text-[22px]">
              {stat.value}
            </span>
            <span className="mt-1 text-[11px] font-medium leading-none tracking-[0.06em] text-text-secondary">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
