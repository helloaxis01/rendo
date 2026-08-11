"use client";

import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import type { LibraryView, Recipe } from "@/lib/db/types";
import { cn } from "@/lib/utils";

function recipeMeta(recipe: Recipe) {
  return [
    `${recipe.prep_time_minutes} Mins`,
    recipe.source_handle ? `via ${recipe.source_handle}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CoverMedia({ recipe }: { recipe: Recipe }) {
  if (recipe.cover_image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={recipe.cover_image_url}
        alt=""
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#E8E6E1] p-2 text-center dark:bg-bg-surface">
      <span className="font-display whitespace-pre-line text-[10px] leading-tight tracking-wider text-text-secondary sm:text-[11px]">
        {recipe.cover_fallback_label ?? recipe.title.toUpperCase()}
      </span>
    </div>
  );
}

function FavoriteButton({
  recipe,
  onToggleFavorite,
  className,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={
        recipe.is_favorite ? "Remove from favorites" : "Add to favorites"
      }
      aria-pressed={recipe.is_favorite}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFavorite(recipe.id);
      }}
      className={cn(
        "absolute z-10 flex items-center justify-center rounded-full bg-bg-primary/90 text-text-primary shadow-sm backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
        className
      )}
    >
      <Star
        className={cn("h-3.5 w-3.5", recipe.is_favorite && "fill-text-primary")}
        strokeWidth={2}
      />
    </button>
  );
}

export function RecipeCard({
  recipe,
  onToggleFavorite,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div className="group flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-[16px] bg-[#E8E6E1] dark:bg-bg-surface">
        <Link
          href={`/recipe/${recipe.id}`}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          aria-label={recipe.title}
        >
          <CoverMedia recipe={recipe} />
        </Link>
        <FavoriteButton
          recipe={recipe}
          onToggleFavorite={onToggleFavorite}
          className="right-1.5 top-1.5 h-7 w-7"
        />
      </div>

      <Link
        href={`/recipe/${recipe.id}`}
        className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight">
          {recipe.title}
        </h2>
        <p className="mt-0.5 truncate text-[11px] text-text-secondary">
          {recipeMeta(recipe)}
        </p>
      </Link>
    </div>
  );
}

export function RecipeListItem({
  recipe,
  onToggleFavorite,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-hairline py-3">
      <Link
        href={`/recipe/${recipe.id}`}
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-[#E8E6E1] dark:bg-bg-surface"
        aria-label={recipe.title}
      >
        <CoverMedia recipe={recipe} />
      </Link>

      <button
        type="button"
        aria-label={
          recipe.is_favorite ? "Remove from favorites" : "Add to favorites"
        }
        aria-pressed={recipe.is_favorite}
        onClick={() => onToggleFavorite(recipe.id)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <Star
          className={cn(
            "h-4 w-4",
            recipe.is_favorite && "fill-text-primary"
          )}
          strokeWidth={2}
        />
      </button>

      <Link
        href={`/recipe/${recipe.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-snug">
            {recipe.title}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-text-secondary">
            {recipeMeta(recipe)}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
      </Link>
    </div>
  );
}

export function RecipeGrid({
  recipes,
  view,
  onToggleFavorite,
}: {
  recipes: Recipe[];
  view: LibraryView;
  onToggleFavorite: (id: string) => void;
}) {
  if (!recipes.length) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        No recipes match. Capture a link or clear filters.
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="px-4 pb-10">
        {recipes.map((recipe) => (
          <RecipeListItem
            key={recipe.id}
            recipe={recipe}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-5 px-4 pb-10">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
