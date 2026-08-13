"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { LibraryView, Recipe } from "@/lib/db/types";
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
  columns,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
  typeStyle?: TypeCoverStyle | null;
  columns: LibraryView;
}) {
  const imageUrl = coverImageUrl(recipe);
  const isTypography = !imageUrl;
  const single = columns === "one";

  return (
    <article className="flex w-full flex-col">
      <div
        className={cn(
          "relative w-full overflow-hidden",
          single ? "aspect-[4/3]" : "aspect-[4/3]",
          !isTypography && "bg-bg-muted"
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
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center",
              single && "p-8"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "font-display whitespace-pre-line leading-tight tracking-wider",
                single
                  ? "text-base sm:text-lg"
                  : "text-[11px] sm:text-xs"
              )}
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
          className={cn(
            "absolute z-10 flex items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
            single ? "right-3 top-3" : "right-2 top-2"
          )}
          style={{
            width: single ? 32 : 28,
            height: single ? 32 : 28,
            backgroundColor: "rgba(0,0,0,.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <Heart
            className={cn(
              "shrink-0 text-white",
              single ? "h-4 w-4" : "h-3.5 w-3.5",
              recipe.is_favorite && "fill-white"
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>

      <Link
        href={`/recipe/${recipe.id}`}
        className={cn(
          "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
          single ? "px-4 pb-6 pt-3" : "px-2.5 pb-4 pt-2"
        )}
      >
        <span
          className={cn(
            "line-clamp-2 block font-semibold leading-snug tracking-tight text-text-primary",
            single ? "text-[20px] sm:text-[22px]" : "text-[14px] sm:text-[15px]"
          )}
        >
          {recipe.title}
        </span>
        <span
          className={cn(
            "mt-0.5 block leading-snug text-text-secondary",
            single ? "text-[14px]" : "text-[12px]"
          )}
        >
          {recipe.prep_time_minutes}&nbsp;min
        </span>
      </Link>
    </article>
  );
}

export function RecipeGrid({
  recipes,
  onToggleFavorite,
  columns = "two",
}: {
  recipes: Recipe[];
  onToggleFavorite: (id: string) => void;
  columns?: LibraryView;
}) {
  const gridColumns = columns === "one" ? 1 : 2;

  const typeStyles = useMemo(() => {
    const cells = recipes.map((recipe) => ({
      id: recipe.id,
      isType: !coverImageUrl(recipe),
    }));
    return assignTypeCoverStylesForGrid(cells, gridColumns);
  }, [recipes, gridColumns]);

  useEffect(() => {
    persistTypeCoverStyles(typeStyles);
  }, [typeStyles]);

  if (!recipes.length) {
    return (
      <div className="flex-1 px-4 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] text-center text-sm text-text-secondary">
        No recipes match. Capture a link or clear filters.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid w-full flex-1 gap-x-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        columns === "one" ? "grid-cols-1 gap-y-2" : "grid-cols-2 gap-y-1"
      )}
    >
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          columns={columns}
          onToggleFavorite={onToggleFavorite}
          typeStyle={
            !coverImageUrl(recipe) ? typeStyles.get(recipe.id) ?? null : null
          }
        />
      ))}
    </div>
  );
}
