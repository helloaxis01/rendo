"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import type { Recipe } from "@/lib/db/types";
import { typographyLabelFor } from "@/lib/db/queries";
import {
  assignTypeCoverStylesForGrid,
  persistTypeCoverStyles,
  type TypeCoverStyle,
} from "@/lib/type-cover-color";
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

function coverPosition(recipe: Recipe): string {
  if (recipe.cover_display === "mine") {
    return recipe.user_cover_image_position ?? "50% 50%";
  }
  return recipe.cover_image_position ?? "50% 50%";
}

export function RecipeCard({
  recipe,
  onToggleFavorite,
  typeStyle,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
  typeStyle?: TypeCoverStyle | null;
}) {
  const imageUrl = coverImageUrl(recipe);
  const isTypography = !imageUrl;

  return (
    <article className="flex flex-col">
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden",
          !isTypography && "bg-[#E8E6E1] dark:bg-bg-surface"
        )}
        style={
          imageUrl
            ? {
                backgroundImage: `url(${JSON.stringify(imageUrl)})`,
                backgroundSize: "cover",
                backgroundPosition: coverPosition(recipe),
                backgroundRepeat: "no-repeat",
              }
            : typeStyle
              ? {
                  backgroundColor: typeStyle.backgroundColor,
                }
              : undefined
        }
      >
        {isTypography && typeStyle ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center"
            aria-hidden
          >
            <span
              className="font-display whitespace-pre-line text-[11px] leading-tight tracking-wider sm:text-xs"
              style={{ color: typeStyle.color }}
            >
              {typographyLabelFor(recipe)}
            </span>
          </div>
        ) : null}

        <Link
          href={`/recipe/${recipe.id}`}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text-primary"
          aria-label={recipe.title}
        />

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
      </div>

      <Link
        href={`/recipe/${recipe.id}`}
        className="block px-2.5 pb-4 pt-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <span className="line-clamp-2 block text-[14px] font-semibold leading-snug tracking-tight text-text-primary sm:text-[15px]">
          {recipe.title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-text-secondary">
          {recipe.prep_time_minutes} Mins
        </span>
      </Link>
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
  const typeStyles = useMemo(() => {
    const cells = recipes.map((recipe) => ({
      id: recipe.id,
      isType: !coverImageUrl(recipe),
    }));
    return assignTypeCoverStylesForGrid(cells);
  }, [recipes]);

  useEffect(() => {
    persistTypeCoverStyles(typeStyles);
  }, [typeStyles]);

  if (!recipes.length) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        No recipes match. Capture a link or clear filters.
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-2 gap-x-0 gap-y-1">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          onToggleFavorite={onToggleFavorite}
          typeStyle={
            !coverImageUrl(recipe) ? typeStyles.get(recipe.id) ?? null : null
          }
        />
      ))}
    </div>
  );
}
