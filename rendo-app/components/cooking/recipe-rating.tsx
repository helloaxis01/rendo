"use client";

import { cn } from "@/lib/utils";
import type { Recipe } from "@/lib/db/types";

type Props = {
  recipe: Recipe;
  onCookedChange: (cooked: boolean) => Promise<void>;
  onRatingChange: (rating: number | null) => Promise<void>;
};

export function RecipeRating({
  recipe,
  onCookedChange,
  onRatingChange,
}: Props) {
  const cooked = Boolean(recipe.cooked);
  const rating = recipe.rating ?? null;

  return (
    <section className="mt-8 border-t border-border-hairline px-4 pb-4 pt-6">
      <h2 className="font-display text-[11px] tracking-[0.14em] text-text-secondary">
        COOKED & RATING
      </h2>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-text-primary">Cooked</p>
          <p className="text-[12px] text-text-secondary">
            Mark when you’ve made this dish
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cooked}
          aria-label={cooked ? "Marked as cooked" : "Not cooked yet"}
          onClick={() => void onCookedChange(!cooked)}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
            cooked ? "bg-text-primary" : "bg-bg-muted ring-1 ring-border-hairline"
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-6 w-6 rounded-full bg-bg-primary transition-transform",
              cooked ? "left-7" : "left-1"
            )}
          />
        </button>
      </div>

      <div className="mt-6">
        <p className="text-[14px] font-medium text-text-primary">How was it?</p>
        <p className="text-[12px] text-text-secondary">
          Tap a circle · tap again to clear
        </p>
        <div
          className="mt-3 inline-flex items-center gap-1.5"
          role="radiogroup"
          aria-label="Dish rating"
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const active = rating != null && value <= rating;
            const selected = rating === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${value} of 5`}
                onClick={() =>
                  void onRatingChange(rating === value ? null : value)
                }
                className="flex h-11 w-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full border-2 transition-colors",
                    active
                      ? "border-text-primary bg-text-primary"
                      : "border-border-hairline bg-transparent"
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
        {rating != null ? (
          <p className="mt-2 text-[12px] text-text-secondary">{rating}/5</p>
        ) : null}
      </div>
    </section>
  );
}
