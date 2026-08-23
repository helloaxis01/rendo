"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticMedium } from "@/lib/native/haptics";
import type { CookEvent, Recipe } from "@/lib/db/types";
import {
  backfillCookEvents,
  cookEventHasMemory,
  sortCookEvents,
} from "@/lib/db/cook-events";

type Props = {
  recipe: Recipe;
  /** Primary action — parent opens the cook modal (rating + memory). */
  onCookedRequest: () => void;
  onUndoCooked: () => Promise<void>;
  onAddMemory?: () => void;
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

function formatCookedDateLong(iso: string) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CookHistoryList({
  events,
  onAddMemory,
}: {
  events: CookEvent[];
  onAddMemory?: () => void;
}) {
  return (
    <div className="border-t border-border-hairline px-3.5 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Cook memory
      </p>
      <p className="mt-1 text-[13px] leading-snug text-text-secondary">
        A log of each time you cooked this — separate from Kitchen Notes.
      </p>
      {events.length ? (
        <ol className="mt-3 space-y-3">
          {events.map((event) => {
            const memory = cookEventHasMemory(event);
            return (
              <li key={event.id}>
                <p className="text-[14px] font-medium text-text-primary">
                  {formatCookedDateLong(event.cooked_at)}
                </p>
                {memory ? (
                  <div className="mt-0.5 space-y-0.5 text-[13px] leading-snug text-text-secondary">
                    {event.occasion?.trim() ? (
                      <p className="text-text-primary">{event.occasion.trim()}</p>
                    ) : null}
                    {event.who.length ? (
                      <p>For {event.who.join(", ")}</p>
                    ) : null}
                    {event.note?.trim() ? <p>{event.note.trim()}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-[13px] text-text-secondary">No cooks logged yet.</p>
      )}
      {onAddMemory ? (
        <button
          type="button"
          onClick={() => {
            void hapticMedium();
            onAddMemory();
          }}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-full border border-border-hairline bg-bg-primary text-[14px] font-semibold text-text-primary"
        >
          Add a memory
        </button>
      ) : null}
    </div>
  );
}

export function RecipeRating({
  recipe,
  onCookedRequest,
  onUndoCooked,
  onAddMemory,
}: Props) {
  const cooked = Boolean(recipe.cooked);
  const times = recipe.times_cooked ?? (cooked ? 1 : 0);
  const cookEvents = sortCookEvents(backfillCookEvents(recipe));
  const rating = recipe.rating ?? null;

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
          <div className="px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Last cooked
            </p>
            <p className="mt-1 font-display text-[22px] leading-none tracking-tight">
              {cooked || recipe.last_cooked_at
                ? formatCookedDate(recipe.last_cooked_at)
                : "Not yet"}
            </p>
            {rating != null ? (
              <p className="mt-1 text-[11px] text-text-secondary">
                Rated {rating}/5
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-text-secondary">Stats only</p>
            )}
          </div>
        </div>

        <div className="p-3.5">
          <button
            type="button"
            onClick={() => {
              void hapticMedium();
              onCookedRequest();
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
              onClick={() => void onUndoCooked()}
            >
              Undo cooked
            </button>
          ) : (
            <p className="mt-2 text-center text-[12px] text-text-secondary">
              Opens one sheet for a rating and optional cook memory
            </p>
          )}
        </div>

        <CookHistoryList events={cookEvents} onAddMemory={onAddMemory} />
      </div>
    </section>
  );
}
