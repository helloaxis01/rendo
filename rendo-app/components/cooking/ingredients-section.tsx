"use client";

import { Check } from "lucide-react";
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
  onSendToReminders: () => void;
  toolbar: React.ReactNode;
};

export function IngredientsSection({
  ingredients,
  servingsBase,
  servings,
  unitSystem,
  onToggle,
  onSendToReminders,
  toolbar,
}: Props) {
  return (
    <section className="px-4 pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {toolbar}
        <button
          type="button"
          onClick={onSendToReminders}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EBEAE6] px-3 text-xs font-medium text-text-primary dark:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          Send to Reminders
        </button>
      </div>

      <h2 className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
        INGREDIENTS
      </h2>

      <ul>
        {ingredients.map((ing) => {
          const amount = scaleAmount(ing.amount, servingsBase, servings);
          const converted = convertAmount(amount, ing.unit, unitSystem);
          const qty =
            converted.amount == null
              ? ""
              : `${converted.amount}${converted.unit ? ` ${converted.unit}` : ""}`;
          const checked = Boolean(ing.checked);

          return (
            <li key={ing.id} className="border-b border-border-hairline">
              <label className="flex min-h-[56px] cursor-pointer items-center gap-3 py-3.5">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => onToggle(ing.id, v === true)}
                  aria-label={`Check ${ing.name}`}
                  className="h-[22px] w-[22px] rounded-[6px] border-[#C8C6C0] data-[state=unchecked]:bg-transparent dark:border-border-hairline"
                />
                <span
                  className={cn(
                    "flex min-w-0 flex-1 items-baseline gap-2 text-[15px] leading-snug",
                    checked
                      ? "text-text-secondary line-through opacity-50"
                      : "text-text-primary"
                  )}
                >
                  {qty ? (
                    <span className="shrink-0 font-semibold tabular-nums">
                      {qty}
                    </span>
                  ) : null}
                  <span className="min-w-0 font-normal">{ing.name}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
