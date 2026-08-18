"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  collectKitchenIngredients,
  suggestKitchenIngredients,
} from "@/lib/library/kitchen";
import type { Recipe } from "@/lib/db/types";

type Props = {
  recipes: Recipe[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export function KitchenFilter({ recipes, selected, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const pool = useMemo(() => collectKitchenIngredients(recipes), [recipes]);
  const autocomplete = useMemo(
    () => suggestKitchenIngredients(pool, draft, selected),
    [pool, draft, selected]
  );
  const emptyChips = useMemo(
    () => suggestKitchenIngredients(pool, "", selected),
    [pool, selected]
  );

  function addIngredient(raw: string) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (selected.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    onChange([...selected, value]);
  }

  function removeIngredient(value: string) {
    onChange(selected.filter((item) => item !== value));
  }

  return (
    <div className="px-4">
      <div className="flex flex-wrap gap-2">
        {selected.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 rounded-full border border-text-primary bg-text-primary py-1.5 pl-3 pr-1.5 text-sm text-bg-primary"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => removeIngredient(item)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-bg-primary/80 hover:text-bg-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addIngredient(draft);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Chicken, lemon, garlic…"
            aria-label="Add an ingredient you have"
            aria-autocomplete="list"
            aria-expanded={draft.trim().length > 0 && autocomplete.length > 0}
            aria-controls="kitchen-autocomplete"
            className="h-11 w-full rounded-full border border-border-hairline bg-bg-surface px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          />
          {draft.trim() && autocomplete.length > 0 ? (
            <ul
              id="kitchen-autocomplete"
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-border-hairline bg-bg-surface py-1 shadow-lg"
            >
              {autocomplete.map((name) => (
                <li key={name} role="option">
                  <button
                    type="button"
                    className="flex w-full px-4 py-2.5 text-left text-sm text-text-primary hover:bg-bg-primary"
                    onClick={() => addIngredient(name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!draft.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 text-sm font-medium text-bg-primary disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>

      {!selected.length && emptyChips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {emptyChips.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => addIngredient(name)}
              className={cn(
                "inline-flex h-8 items-center rounded-full border border-border-hairline bg-bg-surface px-3 text-sm text-text-secondary"
              )}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
