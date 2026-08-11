"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import type { Recipe } from "@/lib/db/types";
import { cn } from "@/lib/utils";

function coverImageUrl(recipe: Recipe): string | null {
  if (recipe.cover_display === "mine" && recipe.user_cover_image_url) {
    return recipe.user_cover_image_url;
  }
  const useType =
    recipe.cover_display === "type" ||
    (!recipe.cover_image_url && recipe.cover_display !== "mine");
  if (!useType && recipe.cover_image_url) {
    return recipe.cover_image_url;
  }
  return null;
}

export function RecipeCard({
  recipe,
  onToggleFavorite,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
}) {
  const imageUrl = coverImageUrl(recipe);
  const isTypography = !imageUrl;

  return (
    <article
      className={cn(
        "relative aspect-[3/4] overflow-hidden rounded-none border-0 shadow-none",
        isTypography ? "bg-text-primary" : "bg-[#E8E6E1] dark:bg-bg-surface"
      )}
      style={
        imageUrl
          ? {
              backgroundImage: `url(${JSON.stringify(imageUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
    >
      {isTypography ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center"
          aria-hidden
        >
          <span className="font-display whitespace-pre-line text-[11px] leading-tight tracking-wider text-bg-primary sm:text-xs">
            {recipe.cover_fallback_label ?? recipe.title.toUpperCase()}
          </span>
        </div>
      ) : null}

      <Link
        href={`/recipe/${recipe.id}`}
        className="absolute inset-0 rounded-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text-primary"
        aria-label={recipe.title}
      >
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,.75) 0%, rgba(0,0,0,.35) 55%, rgba(0,0,0,0) 100%)",
          }}
          aria-hidden
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 block px-2.5 pb-2.5 text-left">
          <span className="line-clamp-2 block max-w-full overflow-hidden text-ellipsis text-[14px] font-bold leading-snug text-white sm:text-[15px]">
            {recipe.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-white/80 sm:text-[12px]">
            {recipe.prep_time_minutes} Mins
          </span>
        </span>
      </Link>

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
        className="absolute right-2 top-2 z-10 flex items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{
          width: 28,
          height: 28,
          backgroundColor: "rgba(0,0,0,.35)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-white",
            recipe.is_favorite && "fill-white"
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
    </article>
  );
}

export function RecipeGrid({
  recipes,
  onToggleFavorite,
}: {
  recipes: Recipe[];
  onToggleFavorite: (id: string) => void;
}) {
  if (!recipes.length) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        No recipes match. Capture a link or clear filters.
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-2 gap-0">
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
