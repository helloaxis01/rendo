"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Ingredient, Recipe } from "@/lib/db/types";
import { resolveSearchKey } from "@/lib/ingredients/ingredient-name";
import {
  confirmIngredientConfidence,
  confirmRecipeLowConfidence,
  isLowConfidence,
  patchIngredientInRecipes,
} from "@/lib/ingredients/confidence";
import { formatAmount } from "@/lib/units";
import { cn } from "@/lib/utils";

type Props = {
  recipes: Recipe[];
  saving: boolean;
  onChange: (recipes: Recipe[]) => void;
  onSave: (recipes: Recipe[]) => void;
  onCancel: () => void;
};

function measureLabel(ing: Ingredient) {
  const amount = formatAmount(ing.amount, ing.unit);
  const unit = ing.unit?.trim() ?? "";
  return [amount, unit].filter(Boolean).join(" ");
}

function displayName(ing: Ingredient) {
  const prep = ing.preparation_notes?.trim();
  if (!prep) return ing.name;
  return `${ing.name}, ${prep}`;
}

export function ImportConfidenceReview({
  recipes,
  saving,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const lowCount = recipes.reduce(
    (sum, recipe) =>
      sum + recipe.ingredients_normalized.filter(isLowConfidence).length,
    0
  );

  function updateIngredient(
    recipeId: string,
    ingredientId: string,
    patch: Partial<Ingredient>
  ) {
    onChange(patchIngredientInRecipes(recipes, recipeId, ingredientId, patch));
  }

  function confirmOne(recipeId: string, ingredient: Ingredient) {
    onChange(
      patchIngredientInRecipes(
        recipes,
        recipeId,
        ingredient.id,
        confirmIngredientConfidence(ingredient)
      )
    );
    setEditingKey(null);
  }

  function confirmAll() {
    onChange(recipes.map(confirmRecipeLowConfidence));
    setEditingKey(null);
  }

  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="rounded-2xl border border-accent-working/40 bg-accent-working/[0.08] px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-working">
          Check these first
        </p>
        <p className="mt-1.5 text-[14px] leading-snug text-text-primary">
          {lowCount === 1
            ? "1 ingredient looked unclear. Tap to tweak or confirm before saving."
            : `${lowCount} ingredients looked unclear. Tap to tweak or confirm before saving.`}
        </p>
      </div>

      <div className="max-h-[min(52vh,420px)] space-y-5 overflow-y-auto overscroll-contain">
        {recipes.map((recipe) => {
          const flagged = recipe.ingredients_normalized.filter(isLowConfidence);
          if (!flagged.length) return null;
          return (
            <section key={recipe.id}>
              <h3 className="mb-2 px-0.5 text-[13px] font-semibold text-text-primary">
                {recipe.title || "Untitled recipe"}
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-border-hairline">
                {flagged.map((ing) => {
                  const key = `${recipe.id}:${ing.id}`;
                  const editing = editingKey === key;
                  return (
                    <li
                      key={ing.id}
                      className="border-b border-border-hairline last:border-b-0"
                    >
                      {editing ? (
                        <div className="space-y-2 bg-accent-working/[0.06] px-3 py-3">
                          {ing.raw_text?.trim() ? (
                            <p className="text-[12px] leading-snug text-text-secondary">
                              From photo:{" "}
                              <span className="text-text-primary">
                                {ing.raw_text.trim()}
                              </span>
                            </p>
                          ) : null}
                          <div className="grid grid-cols-[4.5rem_4rem_minmax(0,1fr)] gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label="Amount"
                              placeholder="Amt"
                              value={ing.amount ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (!raw) {
                                  updateIngredient(recipe.id, ing.id, {
                                    amount: null,
                                  });
                                  return;
                                }
                                const n = Number(raw);
                                if (Number.isFinite(n)) {
                                  updateIngredient(recipe.id, ing.id, {
                                    amount: n,
                                  });
                                }
                              }}
                              className="rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-base tabular-nums text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
                            />
                            <input
                              type="text"
                              aria-label="Unit"
                              placeholder="Unit"
                              value={ing.unit ?? ""}
                              onChange={(e) =>
                                updateIngredient(recipe.id, ing.id, {
                                  unit: e.target.value || null,
                                })
                              }
                              className="rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-base text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
                            />
                            <input
                              type="text"
                              aria-label="Ingredient name"
                              placeholder="Ingredient"
                              value={ing.name}
                              onChange={(e) =>
                                updateIngredient(recipe.id, ing.id, {
                                  name: e.target.value,
                                  search_key: resolveSearchKey(
                                    e.target.value.trim() || "ingredient"
                                  ),
                                })
                              }
                              className="rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-base text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
                            />
                          </div>
                          <input
                            type="text"
                            aria-label="Prep notes"
                            placeholder="Prep (optional)"
                            value={ing.preparation_notes ?? ""}
                            onChange={(e) =>
                              updateIngredient(recipe.id, ing.id, {
                                preparation_notes: e.target.value || null,
                              })
                            }
                            className="w-full rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-base text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
                          />
                          <div className="flex gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              className="flex-1"
                              onClick={() => confirmOne(recipe.id, ing)}
                            >
                              Confirm
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => setEditingKey(null)}
                            >
                              Done
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-stretch gap-1 bg-accent-working/[0.06]">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3.5 text-left"
                            onClick={() => setEditingKey(key)}
                          >
                            <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-accent-working/20 px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-working">
                              Check
                            </span>
                            <span className="min-w-0 text-[15px] leading-[22px] text-text-primary">
                              {measureLabel(ing) ? (
                                <span className="mr-2 font-semibold tabular-nums">
                                  {measureLabel(ing)}
                                </span>
                              ) : null}
                              <span className="font-normal">
                                {displayName(ing)}
                              </span>
                            </span>
                            <Pencil className="ml-auto h-3.5 w-3.5 shrink-0 text-text-secondary" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Confirm ${ing.name}`}
                            className="inline-flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border-hairline text-accent-working hover:bg-accent-working/15"
                            onClick={() => confirmOne(recipe.id, ing)}
                          >
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                            <span className="text-[10px] font-semibold">
                              OK
                            </span>
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {lowCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={saving}
            onClick={confirmAll}
          >
            Confirm all as written
          </Button>
        ) : null}
        <Button
          type="button"
          className="w-full"
          disabled={saving}
          onClick={() => onSave(recipes)}
        >
          {saving
            ? "Saving…"
            : `Save ${recipes.length === 1 ? "recipe" : `${recipes.length} recipes`}`}
        </Button>
        <button
          type="button"
          className={cn(
            "w-full py-2 text-center text-[13px] text-text-secondary",
            saving && "pointer-events-none opacity-40"
          )}
          disabled={saving}
          onClick={onCancel}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
