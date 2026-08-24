"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticMedium } from "@/lib/native/haptics";
import type { CookEvent, Recipe } from "@/lib/db/types";
import {
  backfillCookEvents,
  cookEventHasMemory,
  sortCookEvents,
  yourVersionText,
} from "@/lib/db/cook-events";

const COOK_LOG_PAGE = 20;

type Props = {
  recipe: Recipe;
  onSaveYourVersion: (text: string) => Promise<void>;
  onCookedRequest: () => void;
  onEditCook: (event: CookEvent) => void;
  onDeleteCook: (eventId: string) => Promise<void>;
};

function formatCookedDate(iso: string | null | undefined) {
  if (!iso) return "Not cooked yet";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "Not cooked yet";
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

function statsSummary(times: number, lastCookedAt: string | null | undefined) {
  const countLabel =
    times === 1 ? "1 time cooked" : `${times} times cooked`;
  if (times <= 0) return `${countLabel} · Not cooked yet`;
  return `${countLabel} · ${formatCookedDate(lastCookedAt)}`;
}

function RatingStars({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${value} of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < value;
        return (
          <Star
            key={i}
            className={cn(
              "h-3 w-3",
              filled
                ? "fill-current text-text-primary"
                : "text-text-secondary/35"
            )}
            strokeWidth={1.6}
            aria-hidden
          />
        );
      })}
    </span>
  );
}

export function KitchenNotes({
  recipe,
  onSaveYourVersion,
  onCookedRequest,
  onEditCook,
  onDeleteCook,
}: Props) {
  const cooked = Boolean(recipe.cooked);
  const times = recipe.times_cooked ?? 0;
  const cookEvents = useMemo(
    () => sortCookEvents(backfillCookEvents(recipe)),
    [recipe]
  );
  const versionSeed = yourVersionText(recipe.kitchen_notes);
  const [versionDraft, setVersionDraft] = useState(versionSeed);
  const [versionSaving, setVersionSaving] = useState(false);
  const [visibleCount, setVisibleCount] = useState(COOK_LOG_PAGE);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setVersionDraft(versionSeed);
  }, [versionSeed, recipe.id]);

  useEffect(() => {
    setVisibleCount(COOK_LOG_PAGE);
  }, [recipe.id, cookEvents.length]);

  async function commitYourVersion() {
    if (versionDraft.trim() === versionSeed.trim()) return;
    setVersionSaving(true);
    try {
      await onSaveYourVersion(versionDraft);
    } finally {
      setVersionSaving(false);
    }
  }

  const visibleEvents = cookEvents.slice(0, visibleCount);
  const hasMore = cookEvents.length > visibleCount;

  return (
    <section className="relative z-20 px-4 pb-10 pt-6">
      <div className="overflow-hidden rounded-[22px] border border-border-hairline bg-bg-surface">
        <div className="px-3.5 py-3.5">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
            KITCHEN NOTES
          </h2>
        </div>

        <div className="border-t border-border-hairline px-3.5 py-3.5">
          <p className="text-[10px] font-medium tracking-[0.06em] text-text-secondary/80">
            YOUR VERSION
          </p>
          <p className="mt-1 text-[12px] leading-snug text-text-secondary">
            Standing note on how you make this — swaps, tweaks, preferences.
          </p>
          <textarea
            value={versionDraft}
            onChange={(e) => setVersionDraft(e.target.value)}
            onBlur={() => void commitYourVersion()}
            placeholder="e.g. Use smoked paprika, skip the anchovies…"
            className="mt-2.5 min-h-24 w-full resize-y rounded-2xl border border-border-hairline bg-bg-primary p-3 text-base leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          />
          {versionSaving ? (
            <p className="mt-1.5 text-[12px] text-text-secondary">Saving…</p>
          ) : null}
        </div>

        <div className="border-t border-border-hairline px-3.5 pb-3 pt-3.5">
          <p className="text-[12px] leading-snug text-text-secondary">
            {statsSummary(times, recipe.last_cooked_at)}
          </p>
          <button
            type="button"
            onClick={() => {
              void hapticMedium();
              onCookedRequest();
            }}
            className={cn(
              "mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold",
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
        </div>

        <div className="border-t border-border-hairline px-3.5 py-3.5">
          <p className="text-[10px] font-medium tracking-[0.06em] text-text-secondary/80">
            COOK LOG
          </p>
          {cookEvents.length ? (
            <>
              <ol className="mt-2.5 space-y-0 divide-y divide-border-hairline">
                {visibleEvents.map((event) => {
                  const memory = cookEventHasMemory(event);
                  const busy = deletingId === event.id;
                  return (
                    <li key={event.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => onEditCook(event)}
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-[14px] font-medium text-text-primary">
                              {formatCookedDateLong(event.cooked_at)}
                            </p>
                            {event.rating != null ? (
                              <RatingStars value={event.rating} />
                            ) : null}
                          </div>
                          {memory ? (
                            <div className="mt-1 space-y-0.5 text-[13px] leading-snug text-text-secondary">
                              {event.occasion?.trim() ? (
                                <p className="text-text-primary">
                                  {event.occasion.trim()}
                                </p>
                              ) : null}
                              {event.who.length ? (
                                <p>For {event.who.join(", ")}</p>
                              ) : null}
                              {event.note?.trim() ? (
                                <p>{event.note.trim()}</p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-1 text-[13px] text-text-secondary">
                              Logged cook
                            </p>
                          )}
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label="Edit cook"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-primary hover:text-text-primary"
                            disabled={busy}
                            onClick={() => onEditCook(event)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete cook"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-primary hover:text-accent-alert"
                            disabled={busy}
                            onClick={() => {
                              setDeletingId(event.id);
                              void onDeleteCook(event.id).finally(() =>
                                setDeletingId(null)
                              );
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {hasMore ? (
                <button
                  type="button"
                  className="mt-2 w-full py-2 text-center text-[13px] font-medium text-text-secondary"
                  onClick={() =>
                    setVisibleCount((count) => count + COOK_LOG_PAGE)
                  }
                >
                  Load more ({cookEvents.length - visibleCount} older)
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-2.5 text-[13px] leading-snug text-text-secondary">
              No cooks logged yet — tap &ldquo;I cooked this&rdquo; above to log
              your first one.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
