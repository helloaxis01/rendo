"use client";

import { RecipeCard } from "@/components/library/recipe-grid";
import type { Recipe } from "@/lib/db/types";
import { libraryShelves } from "@/lib/library/shelves";

type Props = {
  recipes: Recipe[];
  onToggleFavorite: (id: string) => void;
};

export function LibraryShelves({ recipes, onToggleFavorite }: Props) {
  const shelves = libraryShelves(recipes);
  if (!shelves.length) return null;

  return (
    <div className="pb-3">
      {shelves.map((shelf) => (
        <section key={shelf.id} className="pt-3">
          <h2 className="px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            {shelf.label}
          </h2>
          <div
            className="scrollbar-none mt-2 flex overflow-x-auto overscroll-x-contain pb-1 pl-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {shelf.recipes.map((recipe) => (
              <div
                key={recipe.id}
                className="w-[min(11.75rem,46vw)] shrink-0"
              >
                <RecipeCard
                  recipe={recipe}
                  columns="two"
                  onToggleFavorite={onToggleFavorite}
                />
              </div>
            ))}
            <div className="w-4 shrink-0" aria-hidden />
          </div>
        </section>
      ))}
    </div>
  );
}
