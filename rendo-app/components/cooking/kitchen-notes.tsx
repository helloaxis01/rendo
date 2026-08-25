"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Star, Trash2, X } from "lucide-react";
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

/** Primary cook-log CTA label (recipe detail, modals, empty states). */
export const LOG_A_DISH_LABEL = "Log a Dish";

type Props = {
  recipe: Recipe;
  onSaveYourVersion: (text: string) => Promise<void>;
  onCookedRequest: () => void;
  onUndoCooked: () => Promise<void>;
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

function MemoryPhotoLightbox({
  urls,
  index,
  onClose,
  onIndexChange,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  if (typeof document === "undefined") return null;
  const url = urls[index];
  if (!url) return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-black/92">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-[13px] text-white/70">
          {index + 1} of {urls.length}
        </p>
        <button
          type="button"
          aria-label="Close photo"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <button
        type="button"
        className="absolute inset-0 -z-10"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      </div>
      {urls.length > 1 ? (
        <div className="flex justify-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1}`}
              className={cn(
                "h-2 w-2 rounded-full",
                i === index ? "bg-white" : "bg-white/35"
              )}
              onClick={() => onIndexChange(i)}
            />
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

export function KitchenNotes({
  recipe,
  onSaveYourVersion,
  onCookedRequest,
  onUndoCooked,
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
  const [versionEditing, setVersionEditing] = useState(!versionSeed.trim());
  const [versionExpanded, setVersionExpanded] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionDeleting, setVersionDeleting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(COOK_LOG_PAGE);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    urls: string[];
    index: number;
  } | null>(null);

  useEffect(() => {
    setVersionDraft(versionSeed);
    setVersionEditing(!versionSeed.trim());
    setVersionExpanded(false);
  }, [versionSeed, recipe.id]);

  useEffect(() => {
    setVisibleCount(COOK_LOG_PAGE);
  }, [recipe.id, cookEvents.length]);

  async function saveYourVersion() {
    setVersionSaving(true);
    try {
      await onSaveYourVersion(versionDraft);
      setVersionEditing(false);
      setVersionExpanded(false);
    } finally {
      setVersionSaving(false);
    }
  }

  async function deleteYourVersion() {
    if (!versionSeed.trim()) return;
    const ok = window.confirm("Delete your recipe notes for this recipe?");
    if (!ok) return;
    setVersionDeleting(true);
    try {
      await onSaveYourVersion("");
      setVersionDraft("");
      setVersionEditing(true);
      setVersionExpanded(false);
    } finally {
      setVersionDeleting(false);
    }
  }

  const visibleEvents = cookEvents.slice(0, visibleCount);
  const hasMore = cookEvents.length > visibleCount;
  const versionDirty = versionDraft.trim() !== versionSeed.trim();
  const showVersionField = versionEditing || !versionSeed.trim();

  return (
    <div className="relative z-20 space-y-4 px-4 pb-4 pt-4">
      <section aria-label="Recipe notes">
        <div className="overflow-hidden rounded-[22px] border border-border-hairline bg-bg-surface">
          <div className="flex items-start justify-between gap-3 px-3.5 py-3.5">
            <div className="min-w-0 flex-1">
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
                RECIPE NOTES
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-text-secondary">
                Standing notes on how you made this, including swaps, tweaks,
                and preferences.
              </p>
            </div>
            {!showVersionField && versionSeed ? (
              <div className="flex shrink-0 items-center gap-1 pt-0.5">
                <button
                  type="button"
                  aria-label="Edit recipe notes"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-primary hover:text-text-primary"
                  onClick={() => {
                    setVersionDraft(versionSeed);
                    setVersionEditing(true);
                    setVersionExpanded(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete recipe notes"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-primary hover:text-accent-alert"
                  disabled={versionDeleting}
                  onClick={() => void deleteYourVersion()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="border-t border-border-hairline px-3.5 py-3.5">
            {showVersionField ? (
              <div className="space-y-3">
                <textarea
                  value={versionDraft}
                  onChange={(e) => setVersionDraft(e.target.value)}
                  onFocus={() => setVersionExpanded(true)}
                  placeholder="e.g. Use smoked paprika, skip the anchovies…"
                  rows={versionExpanded || versionDraft.trim() ? 4 : 1}
                  className={cn(
                    "w-full resize-y rounded-2xl border border-border-hairline bg-bg-primary px-3 py-2.5 text-base leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
                    versionExpanded || versionDraft.trim()
                      ? "min-h-24"
                      : "min-h-11"
                  )}
                />
                <div className="flex items-center justify-end gap-2">
                  {versionSeed.trim() ? (
                    <button
                      type="button"
                      className="px-3 py-2 text-[13px] text-text-secondary"
                      disabled={versionSaving}
                      onClick={() => {
                        setVersionDraft(versionSeed);
                        setVersionEditing(false);
                        setVersionExpanded(false);
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full bg-text-primary px-4 py-2 text-[13px] font-semibold text-bg-primary disabled:opacity-40"
                    disabled={versionSaving || !versionDirty}
                    onClick={() => void saveYourVersion()}
                  >
                    {versionSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text-primary">
                {versionSeed}
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Memory log">
        <div className="overflow-hidden rounded-[22px] border border-border-hairline bg-bg-surface">
          <div className="px-3.5 py-3.5">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              MEMORY LOG
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-text-secondary">
              {statsSummary(times, recipe.last_cooked_at)}
            </p>
            <button
              type="button"
              onClick={() => {
                void hapticMedium();
                onCookedRequest();
              }}
              className={cn(
                "mt-3 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold",
                cooked
                  ? "bg-bg-muted text-text-primary"
                  : "bg-text-primary text-bg-primary"
              )}
            >
              {LOG_A_DISH_LABEL}
            </button>
            {cooked ? (
              <button
                type="button"
                className="mt-2 w-full py-1 text-center text-[12px] text-text-secondary"
                onClick={() => void onUndoCooked()}
              >
                Undo last cook
              </button>
            ) : null}
          </div>

          {cookEvents.length ? (
            <div className="border-t border-border-hairline px-3.5 py-3.5">
              <ol className="space-y-0 divide-y divide-border-hairline">
                {visibleEvents.map((event) => {
                  const memory = cookEventHasMemory(event);
                  const busy = deletingId === event.id;
                  const photos = (event.photo_urls ?? []).filter(Boolean);
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
                          {photos[0] ? (
                            <button
                              type="button"
                              aria-label="View cook photo"
                              className="mr-1 h-11 w-11 overflow-hidden rounded-lg border border-border-hairline"
                              onClick={() =>
                                setLightbox({ urls: photos, index: 0 })
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photos[0]}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : null}
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
                      {photos.length > 1 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {photos.slice(1).map((url, index) => (
                            <button
                              key={url}
                              type="button"
                              aria-label={`View cook photo ${index + 2}`}
                              className="h-11 w-11 overflow-hidden rounded-lg border border-border-hairline"
                              onClick={() =>
                                setLightbox({
                                  urls: photos,
                                  index: index + 1,
                                })
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      ) : null}
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
            </div>
          ) : null}
        </div>
      </section>

      {lightbox ? (
        <MemoryPhotoLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(index) =>
            setLightbox((prev) => (prev ? { ...prev, index } : prev))
          }
        />
      ) : null}
    </div>
  );
}
