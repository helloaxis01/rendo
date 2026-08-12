"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  convertAmount,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";
import type { Ingredient } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Props = {
  ingredients: Ingredient[];
  servingsBase: number;
  servings: number;
  unitSystem: UnitSystem;
  onToggle: (id: string, checked: boolean) => void;
  onSave: (ingredients: Ingredient[]) => Promise<void>;
  toolbar: React.ReactNode;
};

function searchKeyFromName(name: string) {
  return name.toLowerCase().split(/\s+/).filter(Boolean).pop() || "ingredient";
}

export function IngredientsSection({
  ingredients,
  servingsBase,
  servings,
  unitSystem,
  onToggle,
  onSave,
  toolbar,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Ingredient[]>(ingredients);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(ingredients);
  }, [ingredients, editing]);

  async function commit() {
    const cleaned = draft
      .map((ing) => ({
        ...ing,
        name: ing.name.trim(),
        unit: ing.unit?.trim() ? ing.unit.trim() : null,
        amount:
          ing.amount == null || !Number.isFinite(ing.amount)
            ? null
            : ing.amount,
        search_key: searchKeyFromName(ing.name.trim() || "ingredient"),
      }))
      .filter((ing) => ing.name.length > 0);
    setSaving(true);
    try {
      await onSave(cleaned);
      setEditing(false);
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
        checked: false,
      },
    ]);
  }

  return (
    <section className="px-4 pt-4">
      <div className="mb-4">{toolbar}</div>

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
          {draft.map((ing) => (
            <li
              key={ing.id}
              className="flex items-start gap-2 border-b border-border-hairline py-3"
            >
              <div className="grid min-w-0 flex-1 grid-cols-[4.5rem_4rem_minmax(0,1fr)] gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Amount"
                  placeholder="Amt"
                  value={ing.amount ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      updateDraft(ing.id, { amount: null });
                      return;
                    }
                    const n = Number(raw);
                    updateDraft(ing.id, {
                      amount: Number.isFinite(n) ? n : ing.amount,
                    });
                  }}
                  className="rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-[14px] tabular-nums text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
                />
                <input
                  type="text"
                  aria-label="Unit"
                  placeholder="Unit"
                  value={ing.unit ?? ""}
                  onChange={(e) =>
                    updateDraft(ing.id, { unit: e.target.value || null })
                  }
                  className="rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-[14px] text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
                />
                <input
                  type="text"
                  aria-label="Ingredient name"
                  placeholder="Ingredient"
                  value={ing.name}
                  onChange={(e) =>
                    updateDraft(ing.id, { name: e.target.value })
                  }
                  className="rounded-lg border border-border-hairline bg-bg-surface px-2 py-2 text-[14px] text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
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
          ))}
        </ul>
      ) : (
        <ul>
          {ingredients.map((ing) => {
            const amount = scaleAmount(ing.amount, servingsBase, servings);
            const converted = convertAmount(amount, ing.unit, unitSystem);
            const amountLabel =
              converted.amount == null ? "" : String(converted.amount);
            const unitLabel = converted.unit?.trim() ?? "";
            const checked = Boolean(ing.checked);

            return (
              <li key={ing.id} className="border-b border-border-hairline">
                <label className="grid min-h-[56px] cursor-pointer grid-cols-[auto_2.75rem_2.85rem_minmax(0,1fr)] items-center gap-x-2 py-3.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => onToggle(ing.id, v === true)}
                    aria-label={`Check ${ing.name}`}
                    className="h-[22px] w-[22px] rounded-[6px] border-[#C8C6C0] data-[state=unchecked]:bg-transparent dark:border-border-hairline"
                  />
                  <span
                    className={cn(
                      "truncate text-left text-[15px] font-semibold tabular-nums leading-snug",
                      checked
                        ? "text-text-secondary line-through opacity-50"
                        : "text-text-primary"
                    )}
                  >
                    {amountLabel || "\u00A0"}
                  </span>
                  <span
                    className={cn(
                      "truncate text-left text-[15px] font-semibold leading-snug",
                      checked
                        ? "text-text-secondary line-through opacity-50"
                        : "text-text-primary"
                    )}
                    title={unitLabel || undefined}
                  >
                    {unitLabel || "\u00A0"}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 text-left text-[15px] font-normal leading-snug",
                      checked
                        ? "text-text-secondary line-through opacity-50"
                        : "text-text-primary"
                    )}
                  >
                    {ing.name}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
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
