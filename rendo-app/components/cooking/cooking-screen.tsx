"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CookingCoverActions,
  ServingsMenuControls,
} from "@/components/cooking/cooking-header";
import { CoverSpace, type CoverDisplayMode } from "@/components/cooking/cover-space";
import { IngredientsSection } from "@/components/cooking/ingredients-section";
import { StepsSection } from "@/components/cooking/steps-section";
import { TagsSection } from "@/components/cooking/tags-section";
import { KitchenNotes } from "@/components/cooking/kitchen-notes";
import { KeepAwakeBar } from "@/components/cooking/keep-awake-bar";
import { RecipePrintSheet } from "@/components/cooking/recipe-print-sheet";
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
  setRecipeRating,
  setRecipeTags,
  setUserCoverImage,
  typographyLabelFor,
  updateKitchenNote,
  updatePrepTimeMinutes,
  updateRecipeIngredients,
  updateRecipeSteps,
  updateRecipeTitle,
} from "@/lib/db/queries";
import type { Recipe } from "@/lib/db/types";
import type { UnitSystem } from "@/lib/units";
import {
  formatIngredientLine,
  scaleAmount,
} from "@/lib/units";

type Props = {
  recipeId: string;
};

function resolveCoverMode(recipe: Recipe): CoverDisplayMode {
  if (recipe.cover_display === "type" || recipe.cover_display === "mine") {
    return recipe.cover_display;
  }
  if (recipe.cover_display === "photo") return "photo";
  return recipe.cover_image_url ? "photo" : "type";
}

export function CookingScreen({ recipeId }: Props) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(4);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [coverMode, setCoverMode] = useState<CoverDisplayMode>("photo");
  const [activeStep, setActiveStep] = useState(1);
  const [keepAwake, setKeepAwake] = useState(true);
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
    void (async () => {
      const prefs = await getPreferences();
      if (cancelled) return;
      setUnitSystem(prefs.unit_system);
      await markOpened(recipeId);
      const [r, tags] = await Promise.all([getRecipe(recipeId), listTags()]);
      if (cancelled) return;
      if (!r) {
        setMissing(true);
        return;
      }
      setRecipe(r);
      setVaultTagNames(tags.map((t) => t.name));
      setServings(r.servings_base);
      setCoverMode(resolveCoverMode(r));
      setActiveStep(r.steps[0]?.step_number ?? 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;

    async function requestLock() {
      if (!keepAwake || !("wakeLock" in navigator)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Browser may deny without visible document / unsupported context
      }
    }

    if (keepAwake) {
      void requestLock();
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && keepAwake) {
        void requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [keepAwake]);

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

    if (navigator.share) {
      try {
        await navigator.share({ title: recipe.title, text });
        return;
      } catch {
        // fall through
      }
    }
    await navigator.clipboard.writeText(text);
    alert("Ingredient list copied — paste into Reminders.");
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteRecipe(recipeId);
      router.replace("/");
    } catch {
      setDeleting(false);
    }
  }

  function handlePrint() {
    const previousTitle = document.title;
    document.title = recipe?.title ? `${recipe.title} · RENDO` : previousTitle;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  if (missing) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center px-4 text-text-secondary">
        Recipe not found.
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center px-4 text-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary print:max-w-none">
      <RecipePrintSheet
        recipe={recipe}
        servings={servings}
        unitSystem={unitSystem}
      />
      <div className="print:hidden">
        <CoverSpace
          recipeId={recipe.id}
          coverImageUrl={recipe.cover_image_url}
          userCoverImageUrl={recipe.user_cover_image_url}
          coverImagePosition={recipe.cover_image_position}
          userCoverImagePosition={recipe.user_cover_image_position}
          fallbackLabel={typographyLabelFor(recipe)}
          title={recipe.title}
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
        <IngredientsSection
          ingredients={recipe.ingredients_normalized}
          servingsBase={recipe.servings_base}
          servings={servings}
          unitSystem={unitSystem}
          toolbar={
            <ServingsMenuControls
              servings={servings}
              onServingsChange={setServings}
              unitSystem={unitSystem}
              onUnitSystemChange={(s) => void handleUnitChange(s)}
            />
          }
          onToggle={(id, checked) => {
            void setIngredientChecked(recipe.id, id, checked).then(refresh);
          }}
          onSave={async (ingredients) => {
            await updateRecipeIngredients(recipe.id, ingredients);
            await refresh();
          }}
        />
        <KeepAwakeBar
          enabled={keepAwake}
          onEnabledChange={setKeepAwake}
          className="mt-6"
        />
        <StepsSection
          steps={recipe.steps}
          activeStep={activeStep}
          onActiveStepChange={setActiveStep}
          onSave={async (steps) => {
            await updateRecipeSteps(recipe.id, steps);
            await refresh();
          }}
        />
        <TagsSection
          tags={recipe.tags}
          vaultTags={vaultTagNames}
          onChange={async (tags) => {
            await setRecipeTags(recipe.id, tags);
            await refresh();
          }}
        />
        <RecipeSource recipe={recipe} />
        <RecipeRating
          recipe={recipe}
          onCookedChange={async (cooked) => {
            setRecipe((prev) =>
              prev
                ? {
                    ...prev,
                    cooked,
                    times_cooked: cooked
                      ? prev.cooked
                        ? prev.times_cooked ?? 1
                        : (prev.times_cooked ?? 0) + 1
                      : prev.times_cooked,
                  }
                : prev
            );
            await setRecipeCooked(recipe.id, cooked);
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
                  }
                : prev
            );
            await setRecipeRating(recipe.id, rating);
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
    </div>
  );
}
