"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  convertAmount,
  formatAmount,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";
import type { Ingredient } from "@/lib/db/types";
import {
  confirmIngredientConfidence,
  isLowConfidence,
} from "@/lib/ingredients/confidence";
import { resolveSearchKey } from "@/lib/ingredients/ingredient-name";
import { groupIngredientsBySection } from "@/lib/recipe/ingredient-sections";
import { cn } from "@/lib/utils";

type Props = {
  ingredients: Ingredient[];
  servingsBase: number;
  servings: number;
  unitSystem: UnitSystem;
  onToggle: (id: string, checked: boolean) => void;
  onSave: (ingredients: Ingredient[]) => Promise<void>;
  onCountChange?: (count: number) => void;
  /** Ingredient ids currently on the app-wide shopping list. */
  shoppingIds?: Set<string>;
  onShoppingToggle?: (ingredient: Ingredient, on: boolean) => void;
};

const fieldClass =
  "rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-base text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary";

export function IngredientsSection({
  ingredients,
  servingsBase,
  servings,
  unitSystem,
  onToggle,
  onSave,
  onCountChange,
  shoppingIds,
  onShoppingToggle,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Ingredient[]>(ingredients);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing && !reviewingId) setDraft(ingredients);
  }, [ingredients, editing, reviewingId]);

  useEffect(() => {
    const list = editing || reviewingId ? draft : ingredients;
    const count = list.filter((ing) => ing.name.trim().length > 0).length;
    onCountChange?.(count);
  }, [editing, reviewingId, draft, ingredients, onCountChange]);

  function cleanList(list: Ingredient[]) {
    return list
      .map((ing) => ({
        ...ing,
        name: ing.name.trim(),
        unit: ing.unit?.trim() ? ing.unit.trim() : null,
        amount:
          ing.amount == null || !Number.isFinite(ing.amount)
            ? null
            : ing.amount,
        preparation_notes: ing.preparation_notes?.trim()
          ? ing.preparation_notes.trim()
          : null,
        search_key: resolveSearchKey(ing.name.trim() || "ingredient"),
      }))
      .filter((ing) => ing.name.length > 0);
  }

  async function commit() {
    setSaving(true);
    try {
      await onSave(cleanList(draft));
      setEditing(false);
      setReviewingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function commitReview(confirm: boolean) {
    if (!reviewingId) return;
    const next = draft.map((ing) => {
      if (ing.id !== reviewingId) return ing;
      const cleaned = {
        ...ing,
        name: ing.name.trim(),
        unit: ing.unit?.trim() ? ing.unit.trim() : null,
        preparation_notes: ing.preparation_notes?.trim()
          ? ing.preparation_notes.trim()
          : null,
        search_key: resolveSearchKey(ing.name.trim() || "ingredient"),
      };
      return confirm ? confirmIngredientConfidence(cleaned) : cleaned;
    });
    setSaving(true);
    try {
      await onSave(cleanList(next));
      setReviewingId(null);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(id: string, patch: Partial<Ingredient>) {
    setDraft((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, ...patch } : ing))
    );
  }

  function removeDraft(id: string) {
    setDraft((prev) => prev.filter((ing) => ing.id !== id));
  }

  function addDraft() {
    setDraft((prev) => [
      ...prev,
      {
        id: `ing_${crypto.randomUUID().slice(0, 8)}`,
        amount: 1,
        unit: null,
        name: "",
        search_key: "ingredient",
        raw_text: null,
        preparation_notes: null,
        confidence_score: null,
        checked: false,
      },
    ]);
  }

  function startReview(ing: Ingredient) {
    setDraft(ingredients);
    setReviewingId(ing.id);
  }

  const ingredientGroups = groupIngredientsBySection(
    editing || reviewingId ? draft : ingredients
  );

  return (
    <section className="mt-5 border-t border-border-hairline px-4 pt-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
          INGREDIENTS
        </h2>
        {editing ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-[12px] text-text-secondary"
              disabled={saving}
              onClick={() => {
                setDraft(ingredients);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-[12px] font-semibold text-text-primary"
              disabled={saving}
              onClick={() => void commit()}
            >
              {saving ? "Saving…" : "Done"}
            </button>
          </div>
        ) : reviewingId ? (
          <button
            type="button"
            className="text-[12px] text-text-secondary"
            disabled={saving}
            onClick={() => {
              setDraft(ingredients);
              setReviewingId(null);
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            aria-label="Edit ingredients"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary hover:text-text-primary"
            onClick={() => {
              setDraft(ingredients);
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <ul>
          {draft.map((ing) => {
            const low = isLowConfidence(ing);
            return (
              <li
                key={ing.id}
                className={cn(
                  "flex items-start gap-2 border-b border-border-hairline py-3",
                  low && "bg-accent-working/[0.06]"
                )}
              >
                <div className="grid min-w-0 flex-1 gap-2">
                  {low ? (
                    <span className="inline-flex w-fit items-center rounded-md bg-accent-working/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-working">
                      Check
                    </span>
                  ) : null}
                  <div className="grid grid-cols-[4.5rem_4rem_minmax(0,1fr)] gap-2">
                    <AmountField
                      value={ing.amount}
                      onChange={(amount) => updateDraft(ing.id, { amount })}
                    />
                    <input
                      type="text"
                      aria-label="Unit"
                      placeholder="Unit"
                      value={ing.unit ?? ""}
                      onChange={(e) =>
                        updateDraft(ing.id, { unit: e.target.value || null })
                      }
                      className={fieldClass}
                    />
                    <input
                      type="text"
                      aria-label="Ingredient name"
                      placeholder="Ingredient"
                      value={ing.name}
                      onChange={(e) =>
                        updateDraft(ing.id, { name: e.target.value })
                      }
                      className={fieldClass}
                    />
                  </div>
                  <input
                    type="text"
                    aria-label="Prep notes"
                    placeholder="Prep (optional)"
                    value={ing.preparation_notes ?? ""}
                    onChange={(e) =>
                      updateDraft(ing.id, {
                        preparation_notes: e.target.value || null,
                      })
                    }
                    className={fieldClass}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${ing.name || "ingredient"}`}
                  className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:text-accent-alert"
                  onClick={() => removeDraft(ing.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div>
          {ingredientGroups.map((group, groupIndex) => (
            <div
              key={`${group.section ?? "default"}-${groupIndex}`}
              className={groupIndex > 0 ? "mt-4" : undefined}
            >
              {group.section ? (
                <p className="mb-1 px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  {group.section}
                </p>
              ) : null}
              <ul>
                {group.items.map((ing) => {
                  const amount = scaleAmount(ing.amount, servingsBase, servings);
                  const converted = convertAmount(amount, ing.unit, unitSystem);
                  const amountLabel = formatAmount(
                    converted.amount,
                    converted.unit
                  );
                  const unitLabel = converted.unit?.trim() ?? "";
                  const measure = [amountLabel, unitLabel]
                    .filter(Boolean)
                    .join(" ");
                  const checked = Boolean(ing.checked);
                  const onList = Boolean(shoppingIds?.has(ing.id));
                  const low = isLowConfidence(ing);
                  const reviewing = reviewingId === ing.id;
                  const prep = ing.preparation_notes?.trim();

                  if (reviewing) {
                    return (
                      <li
                        key={ing.id}
                        className="border-b border-border-hairline bg-accent-working/[0.06] px-0 py-3"
                      >
                        {ing.raw_text?.trim() ? (
                          <p className="mb-2 px-0.5 text-[12px] leading-snug text-text-secondary">
                            From photo:{" "}
                            <span className="text-text-primary">
                              {ing.raw_text.trim()}
                            </span>
                          </p>
                        ) : null}
                        <div className="grid grid-cols-[4.5rem_4rem_minmax(0,1fr)] gap-2">
                          <AmountField
                            value={ing.amount}
                            onChange={(amount) =>
                              updateDraft(ing.id, { amount })
                            }
                          />
                          <input
                            type="text"
                            aria-label="Unit"
                            placeholder="Unit"
                            value={ing.unit ?? ""}
                            onChange={(e) =>
                              updateDraft(ing.id, {
                                unit: e.target.value || null,
                              })
                            }
                            className={fieldClass}
                          />
                          <input
                            type="text"
                            aria-label="Ingredient name"
                            placeholder="Ingredient"
                            value={ing.name}
                            onChange={(e) =>
                              updateDraft(ing.id, { name: e.target.value })
                            }
                            className={fieldClass}
                          />
                        </div>
                        <input
                          type="text"
                          aria-label="Prep notes"
                          placeholder="Prep (optional)"
                          value={ing.preparation_notes ?? ""}
                          onChange={(e) =>
                            updateDraft(ing.id, {
                              preparation_notes: e.target.value || null,
                            })
                          }
                          className={cn(fieldClass, "mt-2 w-full")}
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-text-primary px-3 py-2.5 text-[13px] font-semibold text-bg-primary disabled:opacity-40"
                            onClick={() => void commitReview(true)}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                            {saving ? "Saving…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            className="inline-flex flex-1 items-center justify-center rounded-md border border-border-hairline px-3 py-2.5 text-[13px] font-medium text-text-primary disabled:opacity-40"
                            onClick={() => void commitReview(false)}
                          >
                            Save edit
                          </button>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={ing.id}
                      className={cn(
                        "border-b border-border-hairline",
                        low && "bg-accent-working/[0.06]"
                      )}
                    >
                      <div className="flex min-h-[56px] items-center gap-2 py-3.5">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              onToggle(ing.id, v === true)
                            }
                            aria-label={`Check ${ing.name}`}
                            className="h-[22px] w-[22px] shrink-0 rounded-[6px] leading-none border-[#C8C6C0] data-[state=unchecked]:bg-transparent dark:border-border-hairline"
                          />
                          <span
                            className={cn(
                              "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-left text-[15px] leading-[22px]",
                              checked
                                ? "text-text-secondary line-through opacity-50"
                                : "text-text-primary"
                            )}
                          >
                            {measure ? (
                              <span className="shrink-0 font-semibold tabular-nums">
                                {measure}
                              </span>
                            ) : null}
                            <span className="min-w-0 font-normal">
                              {prep ? `${ing.name}, ${prep}` : ing.name}
                            </span>
                          </span>
                        </label>
                        {low ? (
                          <button
                            type="button"
                            aria-label={`Review ${ing.name}`}
                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent-working/20 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-working"
                            onClick={() => startReview(ing)}
                          >
                            Check
                            <Pencil className="h-3 w-3" />
                          </button>
                        ) : null}
                        {onShoppingToggle ? (
                          <button
                            type="button"
                            aria-label={
                              onList
                                ? `Remove ${ing.name} from shopping list`
                                : `Add ${ing.name} to shopping list`
                            }
                            aria-pressed={onList}
                            onClick={() => onShoppingToggle(ing, !onList)}
                            className={cn(
                              "inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-full px-1.5",
                              onList
                                ? "bg-text-primary text-bg-primary"
                                : "text-text-secondary hover:text-text-primary"
                            )}
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                            <ShoppingBasket className="h-4 w-4" strokeWidth={2} />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
          onClick={addDraft}
        >
          <Plus className="h-3.5 w-3.5" />
          Add ingredient
        </button>
      ) : null}
    </section>
  );
}

function AmountField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (amount: number | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label="Amount"
      placeholder="Amt"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (!raw) {
          onChange(null);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      className={cn(fieldClass, "tabular-nums")}
    />
  );
}
