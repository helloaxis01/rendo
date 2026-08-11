"use client";

import { useEffect, useState } from "react";
import { CookingHeader } from "@/components/cooking/cooking-header";
import { CoverSpace } from "@/components/cooking/cover-space";
import { IngredientsSection } from "@/components/cooking/ingredients-section";
import { StepsSection } from "@/components/cooking/steps-section";
import { KitchenNotes } from "@/components/cooking/kitchen-notes";
import { KeepAwakeBar } from "@/components/cooking/keep-awake-bar";
import {
  appendKitchenNote,
  getPreferences,
  getRecipe,
  markOpened,
  setIngredientChecked,
  setPreferences,
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

export function CookingScreen({ recipeId }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(4);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [coverMode, setCoverMode] = useState<"original" | "mine">("original");
  const [activeStep, setActiveStep] = useState(1);
  const [keepAwake, setKeepAwake] = useState(true);
  const [missing, setMissing] = useState(false);

  async function refresh() {
    const r = await getRecipe(recipeId);
    if (!r) {
      setMissing(true);
      return;
    }
    setRecipe(r);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prefs = await getPreferences();
      if (cancelled) return;
      setUnitSystem(prefs.unit_system);
      await markOpened(recipeId);
      const r = await getRecipe(recipeId);
      if (cancelled) return;
      if (!r) {
        setMissing(true);
        return;
      }
      setRecipe(r);
      setServings(r.servings_base);
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
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary">
      <CookingHeader
        servings={servings}
        onServingsChange={setServings}
        unitSystem={unitSystem}
        onUnitSystemChange={(s) => void handleUnitChange(s)}
      />
      <CoverSpace
        coverImageUrl={recipe.cover_image_url}
        fallbackLabel={recipe.cover_fallback_label}
        title={recipe.title}
        mode={coverMode}
        onModeChange={setCoverMode}
      />
      <IngredientsSection
        ingredients={recipe.ingredients_normalized}
        servingsBase={recipe.servings_base}
        servings={servings}
        unitSystem={unitSystem}
        onToggle={(id, checked) => {
          void setIngredientChecked(recipe.id, id, checked).then(refresh);
        }}
        onSendToReminders={() => void handleSendToReminders()}
      />
      <StepsSection
        steps={recipe.steps}
        activeStep={activeStep}
        onActiveStepChange={setActiveStep}
      />
      <KitchenNotes
        notes={recipe.kitchen_notes}
        onSave={async (text) => {
          await appendKitchenNote(recipe.id, text);
          await refresh();
        }}
      />
      <KeepAwakeBar enabled={keepAwake} onEnabledChange={setKeepAwake} />
    </div>
  );
}
