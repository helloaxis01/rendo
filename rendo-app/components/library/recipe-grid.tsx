"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { CoverPhoto } from "@/components/cover/cover-photo";
import { TypeCover } from "@/components/cover/type-cover";
import type { LibraryView, Recipe } from "@/lib/db/types";
import { rememberRecipe } from "@/lib/db/recipe-cache";
import { isUsableImageUrl } from "@/lib/cover";
import { openRecipeSession } from "@/lib/nav/recipe-session";
import { displaySubtitle } from "@/lib/extract/subtitle";
import { cn } from "@/lib/utils";

function coverImageUrl(recipe: Recipe): string | null {
  if (recipe.cover_display === "mine") {
    return isUsableImageUrl(recipe.user_cover_image_url)
      ? recipe.user_cover_image_url
      : null;
  }
  if (recipe.cover_display === "type") return null;
  return isUsableImageUrl(recipe.cover_image_url)
    ? recipe.cover_image_url
    : null;
}

function coverPosition(recipe: Recipe): string {
  if (recipe.cover_display === "mine") {
    return recipe.user_cover_image_position ?? "50% 50%";
  }
  return recipe.cover_image_position ?? "50% 50%";
}

function openRecipe(recipe: Recipe) {
  rememberRecipe(recipe);
  openRecipeSession(recipe.id);
}

export function RecipeCard({
  recipe,
  onToggleFavorite,
  columns,
}: {
  recipe: Recipe;
  onToggleFavorite: (id: string) => void;
  columns: LibraryView;
}) {
  const imageUrl = coverImageUrl(recipe);
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(imageUrl) && !imageFailed;
  const single = columns === "one";

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <article
      className="flex w-full flex-col"
      onPointerDown={() => rememberRecipe(recipe)}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden",
          "aspect-[4/3]",
          showPhoto && "bg-bg-muted"
        )}
      >
        {showPhoto && imageUrl ? (
          <CoverPhoto
            src={imageUrl}
            position={coverPosition(recipe)}
            className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover"
            onUnavailable={() => setImageFailed(true)}
          />
        ) : (
          <TypeCover
            recipeId={recipe.id}
            label={displaySubtitle(recipe) || ""}
            className={single ? "p-8" : "p-4"}
            textClassName={
              single
                ? "max-w-[18ch] text-base font-bold leading-snug sm:text-lg"
                : "max-w-[16ch] text-[11px] font-bold leading-snug sm:text-xs"
            }
          />
        )}

        <Link
          href={`/recipe/${recipe.id}`}
          scroll={false}
          onClick={() => openRecipe(recipe)}
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
        scroll={false}
        onClick={() => openRecipe(recipe)}
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
        />
      ))}
    </div>
  );
}
