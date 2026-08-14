"use client";

import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticMedium } from "@/lib/native/haptics";
import type { Recipe } from "@/lib/db/types";

const RATING_LABELS = ["", "Not for me", "Okay", "Pretty good", "Loved it", "Making it again"];

type Props = {
  recipe: Recipe;
  onCookedChange: (cooked: boolean) => Promise<void>;
  onRatingChange: (rating: number | null) => Promise<void>;
  onLastCookedChange: (iso: string) => Promise<void>;
};

function formatCookedDate(iso: string | null | undefined) {
  if (!iso) return "Not yet";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "Not yet";
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateInputToIso(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function RecipeRating({
  recipe,
  onCookedChange,
  onRatingChange,
  onLastCookedChange,
}: Props) {
  const cooked = Boolean(recipe.cooked);
  const rating = recipe.rating ?? null;
  const times = recipe.times_cooked ?? (cooked ? 1 : 0);

  return (
    <section className="relative z-20 px-4 pb-2 pt-5">
      <div className="rounded-[22px] border border-border-hairline bg-bg-surface">
        <div className="grid grid-cols-2 gap-px border-b border-border-hairline">
          <div className="px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Times cooked
            </p>
            <p className="mt-1 font-display text-[28px] leading-none tracking-tight tabular-nums">
              {times}
            </p>
          </div>
          <label className="relative block cursor-pointer px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Last cooked
            </p>
            <p className="mt-1 font-display text-[22px] leading-none tracking-tight">
              {cooked || recipe.last_cooked_at
                ? formatCookedDate(recipe.last_cooked_at)
                : "Not yet"}
            </p>
            <p className="mt-1 text-[11px] text-text-secondary">Tap to edit</p>
            <input
              type="date"
              aria-label="Last cooked date"
              className="absolute inset-0 cursor-pointer opacity-0"
              max={toDateInputValue(new Date().toISOString())}
              value={toDateInputValue(recipe.last_cooked_at)}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                void hapticMedium();
                void onLastCookedChange(dateInputToIso(value));
              }}
            />
          </label>
        </div>

        <div className="p-3.5">
          <button
            type="button"
            onClick={() => {
              void hapticMedium();
              void onCookedChange(true);
            }}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold",
              cooked
                ? "bg-bg-muted text-text-primary"
                : "bg-text-primary text-bg-primary"
            )}
          >
            {cooked ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Cooked again
              </>
            ) : (
              "I cooked this"
            )}
          </button>
          {cooked ? (
            <button
              type="button"
              className="mt-2 w-full py-1 text-center text-[12px] text-text-secondary"
              onClick={() => void onCookedChange(false)}
            >
              Undo cooked
            </button>
          ) : (
            <p className="mt-2 text-center text-[12px] text-text-secondary">
              Tap when you’ve made it — we’ll keep a count
            </p>
          )}
        </div>

        <div className="border-t border-border-hairline px-3.5 py-3.5">
          <p className="text-[14px] font-medium text-text-primary">
            {cooked ? "How was it?" : "Rate it after you cook"}
          </p>
          <div
            className="mt-1.5 flex items-center justify-between"
            role="radiogroup"
            aria-label="Dish rating"
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const active = rating != null && value <= rating;
              const selected = rating === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${value} of 5 stars`}
                  onClick={() => {
                    void hapticMedium();
                    void onRatingChange(rating === value ? null : value);
                  }}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
                    active
                      ? "text-text-primary"
                      : "text-text-secondary/40"
                  )}
                >
                  <Star
                    className={cn("h-7 w-7", active && "fill-current")}
                    strokeWidth={1.6}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
          <p className="mt-0.5 min-h-[1.1rem] text-center text-[12px] text-text-secondary">
            {rating != null
              ? RATING_LABELS[rating]
              : "Tap a star · tap again to clear"}
          </p>
        </div>
      </div>
    </section>
  );
}
