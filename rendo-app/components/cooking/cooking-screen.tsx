"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { peekRecipe } from "@/lib/db/recipe-cache";
import { isUsableImageUrl } from "@/lib/cover";
import { closeRecipeSession } from "@/lib/nav/recipe-session";
import {
  CookingCoverActions,
  CookDashboard,
} from "@/components/cooking/cooking-header";
import { CoverSpace, type CoverDisplayMode } from "@/components/cooking/cover-space";
import { displaySubtitle } from "@/lib/extract/subtitle";
import { IngredientsSection } from "@/components/cooking/ingredients-section";
import { CookingMode } from "@/components/cooking/cooking-mode";
import { StepsSection } from "@/components/cooking/steps-section";
import { TagsSection } from "@/components/cooking/tags-section";
import { KitchenNotes } from "@/components/cooking/kitchen-notes";
import { RecipeRating } from "@/components/cooking/recipe-rating";
import { RecipeSource } from "@/components/cooking/recipe-source";
import { RecipeTitleEditor } from "@/components/cooking/recipe-title-editor";
import { PrepTimeEditor } from "@/components/cooking/prep-time-editor";
import {
  appendKitchenNote,
  deleteKitchenNote,
  deleteRecipe,
  getPreferences,
  getRecipe,
  listTags,
  markOpened,
  setCoverDisplay,
  setCoverImagePosition,
  setIngredientChecked,
  setPreferences,
  setRecipeCooked,
  setLastCookedAt,
  setRecipeRating,
  setRecipeTags,
  setUserCoverImage,
  typographyLabelFor,
  updateKitchenNote,
  updatePrepTimeMinutes,
  updateRecipeIngredients,
  updateRecipeSource,
  updateRecipeSteps,
  updateRecipeSubtitle,
  updateRecipeTitle,
} from "@/lib/db/queries";
import type { Recipe } from "@/lib/db/types";
import type { UnitSystem } from "@/lib/units";
import {
  formatIngredientLine,
  scaleAmount,
} from "@/lib/units";
import { sharePlainText } from "@/lib/native/share";
import { printRecipeKeepsake } from "@/lib/print/print-recipe";
import { RecipePrintSheet } from "@/components/cooking/recipe-print-sheet";
import {
  lockPortrait,
  unlockOrientation,
} from "@/lib/native/screen-orientation";

type Props = {
  recipeId: string;
};

function resolveCoverMode(recipe: Recipe): CoverDisplayMode {
  if (recipe.cover_display === "mine") return "mine";
  if (recipe.cover_display === "type") return "type";
  if (recipe.cover_display === "photo") return "photo";
  if (isUsableImageUrl(recipe.cover_image_url)) return "photo";
  return "type";
}

export function CookingScreen({ recipeId }: Props) {
  const router = useRouter();
  const cached = peekRecipe(recipeId);
  const paintedFromCache = useRef(Boolean(cached));
  const [recipe, setRecipe] = useState<Recipe | null>(cached);
  const [servings, setServings] = useState(cached?.servings_base ?? 4);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [coverMode, setCoverMode] = useState<CoverDisplayMode>(
    cached ? resolveCoverMode(cached) : "type"
  );
  const [keepAwakeDefault, setKeepAwakeDefault] = useState(true);
  const [cookingOpen, setCookingOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [vaultTagNames, setVaultTagNames] = useState<string[]>([]);

  async function refresh() {
    const [r, tags] = await Promise.all([getRecipe(recipeId), listTags()]);
    if (!r) {
      setMissing(true);
      return;
    }
    setRecipe(r);
    setVaultTagNames(tags.map((t) => t.name));
  }

  useEffect(() => {
    let cancelled = false;
    void markOpened(recipeId);
    void (async () => {
      const [r, tags, prefs] = await Promise.all([
        getRecipe(recipeId),
        listTags(),
        getPreferences(),
      ]);
      if (cancelled) return;
      setUnitSystem(prefs.unit_system);
      setKeepAwakeDefault(prefs.keep_screen_awake ?? true);
      if (!r) {
        setMissing(true);
        return;
      }
      setRecipe(r);
      setVaultTagNames(tags.map((t) => t.name));
      setCoverMode(resolveCoverMode(r));
      if (!paintedFromCache.current) {
        setServings(r.servings_base);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  useEffect(() => {
    const root = document.documentElement;
    const overlay = document.querySelector("[data-recipe-overlay]");
    if (cookingOpen) {
      root.dataset.cookingOpen = "true";
      overlay?.setAttribute("data-cooking-open", "true");
      void unlockOrientation();
    } else {
      delete root.dataset.cookingOpen;
      overlay?.removeAttribute("data-cooking-open");
      void lockPortrait();
    }
    return () => {
      delete root.dataset.cookingOpen;
      overlay?.removeAttribute("data-cooking-open");
      void lockPortrait();
    };
  }, [cookingOpen]);

  async function handleUnitChange(system: UnitSystem) {
    setUnitSystem(system);
    await setPreferences({ unit_system: system });
  }

  async function handleCoverModeChange(mode: CoverDisplayMode) {
    setCoverMode(mode);
    if (!recipe) return;
    await setCoverDisplay(recipe.id, mode);
    await refresh();
  }

  async function handleUserPhotoUpload(dataUrl: string) {
    setCoverMode("mine");
    await setUserCoverImage(recipeId, dataUrl, "50% 50%");
    await refresh();
  }

  async function handlePositionChange(
    which: "photo" | "mine",
    position: string
  ) {
    if (!recipe) return;
    setRecipe({
      ...recipe,
      ...(which === "mine"
        ? { user_cover_image_position: position }
        : { cover_image_position: position }),
    });
    await setCoverImagePosition(recipe.id, which, position);
  }

  async function handleSendToReminders() {
    if (!recipe) return;
    const lines = recipe.ingredients_normalized.map((ing) => {
      const amount = scaleAmount(ing.amount, recipe.servings_base, servings);
      return `☐ ${formatIngredientLine(amount, ing.unit, ing.name, unitSystem)}`;
    });
    const text = `${recipe.title}\n\n${lines.join("\n")}`;

    try {
      const result = await sharePlainText({ title: recipe.title, text });
      if (result === "copied") {
        alert("Ingredient list copied — paste into Reminders.");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        alert("Ingredient list copied — paste into Reminders.");
      } catch {
        // User dismissed the share sheet or clipboard is blocked.
      }
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteRecipe(recipeId);
      closeRecipeSession();
      router.replace("/");
    } catch {
      setDeleting(false);
    }
  }

  async function handlePrint() {
    if (!recipe) return;
    printRecipeKeepsake(recipe, servings, unitSystem);
  }

  if (missing) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center bg-bg-primary px-4 text-text-secondary">
        Recipe not found.
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary" />
    );
  }

  return (
      <div className="recipe-screen mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary pt-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))] print:max-w-none print:pt-0">
      {cookingOpen ? null : (
        <>
      <div className="print:hidden">
        <CoverSpace
          recipeId={recipe.id}
          coverImageUrl={recipe.cover_image_url}
          userCoverImageUrl={recipe.user_cover_image_url}
          coverImagePosition={recipe.cover_image_position}
          userCoverImagePosition={recipe.user_cover_image_position}
          fallbackLabel={typographyLabelFor(recipe)}
          subtitle={displaySubtitle(recipe)}
          onSubtitleSave={async (next) => {
            await updateRecipeSubtitle(recipe.id, next);
            await refresh();
          }}
          mode={coverMode}
          onModeChange={(mode) => void handleCoverModeChange(mode)}
          onUserPhotoUpload={(dataUrl) => void handleUserPhotoUpload(dataUrl)}
          onPositionChange={(which, position) =>
            void handlePositionChange(which, position)
          }
          topRight={
            <CookingCoverActions
              onPrint={handlePrint}
              onDelete={() => void handleDelete()}
              onShare={() => void handleSendToReminders()}
              deleting={deleting}
            />
          }
        />
        <RecipeTitleEditor
          title={recipe.title}
          onSave={async (title) => {
            await updateRecipeTitle(recipe.id, title);
            await refresh();
          }}
        />
        <PrepTimeEditor
          minutes={recipe.prep_time_minutes}
          onSave={async (minutes) => {
            await updatePrepTimeMinutes(recipe.id, minutes);
            await refresh();
          }}
        />
        <CookDashboard
          onStartCooking={() => setCookingOpen(true)}
          servings={servings}
          onServingsChange={setServings}
          unitSystem={unitSystem}
          onUnitSystemChange={(s) => void handleUnitChange(s)}
        />
        <RecipeRating
          recipe={recipe}
          onCookedChange={async (cooked) => {
            setRecipe((prev) => {
              if (!prev) return prev;
              const currentTimes = prev.times_cooked ?? (prev.cooked ? 1 : 0);
              const times = cooked
                ? currentTimes + 1
                : Math.max(0, currentTimes - 1);
              return {
                ...prev,
                cooked: times > 0,
                times_cooked: times,
                last_cooked_at: times > 0
                  ? cooked
                    ? new Date().toISOString()
                    : prev.last_cooked_at
                  : null,
              };
            });
            await setRecipeCooked(recipe.id, cooked);
            await refresh();
          }}
          onLastCookedChange={async (iso) => {
            setRecipe((prev) =>
              prev
                ? {
                    ...prev,
                    cooked: true,
                    times_cooked: Math.max(
                      1,
                      prev.times_cooked ?? (prev.cooked ? 1 : 0)
                    ),
                    last_cooked_at: iso,
                  }
                : prev
            );
            await setLastCookedAt(recipe.id, iso);
            await refresh();
          }}
          onRatingChange={async (rating) => {
            setRecipe((prev) =>
              prev
                ? {
                    ...prev,
                    rating,
                    cooked: rating != null ? true : prev.cooked,
                    times_cooked:
                      rating != null && !prev.cooked
                        ? (prev.times_cooked ?? 0) + 1
                        : prev.times_cooked,
                    last_cooked_at:
                      rating != null
                        ? new Date().toISOString()
                        : prev.last_cooked_at,
                  }
                : prev
            );
            await setRecipeRating(recipe.id, rating);
            await refresh();
          }}
        />
        <IngredientsSection
          ingredients={recipe.ingredients_normalized}
          servingsBase={recipe.servings_base}
          servings={servings}
          unitSystem={unitSystem}
          onToggle={(id, checked) => {
            void setIngredientChecked(recipe.id, id, checked).then(refresh);
          }}
          onSave={async (ingredients) => {
            await updateRecipeIngredients(recipe.id, ingredients);
            await refresh();
          }}
        />
        <StepsSection
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          steps={recipe.steps}
          onSave={async (steps) => {
            await updateRecipeSteps(recipe.id, steps);
            await refresh();
          }}
        />
        <TagsSection
          tags={recipe.tags}
          title={recipe.title}
          vaultTags={vaultTagNames}
          onChange={async (tags) => {
            await setRecipeTags(recipe.id, tags);
            await refresh();
          }}
        />
        <RecipeSource
          recipe={recipe}
          onSave={async (source) => {
            await updateRecipeSource(recipe.id, source);
            await refresh();
          }}
        />
        <KitchenNotes
          notes={recipe.kitchen_notes}
          onSave={async (text) => {
            await appendKitchenNote(recipe.id, text);
            await refresh();
          }}
          onUpdate={async (noteId, text) => {
            await updateKitchenNote(recipe.id, noteId, text);
            await refresh();
          }}
          onDelete={async (noteId) => {
            await deleteKitchenNote(recipe.id, noteId);
            await refresh();
          }}
        />
      </div>
        </>
      )}
      <CookingMode
        open={cookingOpen}
        recipeId={recipe.id}
        title={recipe.title}
        steps={recipe.steps}
        ingredients={recipe.ingredients_normalized}
        servingsBase={recipe.servings_base}
        servings={servings}
        unitSystem={unitSystem}
        keepAwakeDefault={keepAwakeDefault}
        onClose={() => setCookingOpen(false)}
        onComplete={() => {
          void setRecipeCooked(recipe.id, true).then(() => refresh());
        }}
      />
      <RecipePrintSheet
        recipe={recipe}
        servings={servings}
        unitSystem={unitSystem}
      />
      </div>
  );
}
