"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CookMemory } from "@/lib/db/cook-events";
import { cn } from "@/lib/utils";

export type CookSessionSave = {
  memory: CookMemory;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: CookSessionSave) => Promise<void>;
  /** Prefill when editing an existing cook log entry. */
  initial?: {
    cooked_at?: string | null;
    rating?: number | null;
    occasion?: string | null;
    who?: string[];
    note?: string | null;
  } | null;
  title?: string;
};

const RATING_LABELS = [
  "",
  "Not for me",
  "Okay",
  "Pretty good",
  "Loved it",
  "Making it again",
];

function toDateInputValue(iso: string | null | undefined) {
  const at = iso ? new Date(iso) : new Date();
  if (!Number.isFinite(at.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
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

export function CookMemorySheet({
  open,
  onClose,
  onSave,
  initial = null,
  title = "I cooked this",
}: Props) {
  const [cookedOn, setCookedOn] = useState(toDateInputValue(null));
  const [rating, setRating] = useState<number | null>(null);
  const [occasion, setOccasion] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [whoDraft, setWhoDraft] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCookedOn(toDateInputValue(initial?.cooked_at));
    setRating(initial?.rating ?? null);
    setOccasion(initial?.occasion?.trim() ?? "");
    setWho(initial?.who ?? []);
    setWhoDraft("");
    setNote(initial?.note?.trim() ?? "");
    setSaving(false);
  }, [open, initial]);

  if (!open || typeof document === "undefined") return null;

  function addWho(raw: string) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) return;
    setWho((prev) =>
      prev.some((item) => item.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, name]
    );
    setWhoDraft("");
  }

  function commitWhoDraft() {
    addWho(whoDraft);
  }

  async function handleSave() {
    commitWhoDraft();
    const nextWho = [...who];
    const draft = whoDraft.replace(/\s+/g, " ").trim();
    if (
      draft &&
      !nextWho.some((item) => item.toLowerCase() === draft.toLowerCase())
    ) {
      nextWho.push(draft);
    }
    const memory: CookMemory = {
      cooked_at: dateInputToIso(cookedOn),
      occasion,
      who: nextWho,
      note,
      rating,
    };
    setSaving(true);
    try {
      await onSave({ memory });
    } finally {
      setSaving(false);
    }
  }

  const sheet = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cook-memory-title"
        className="relative z-10 mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] border border-border-hairline bg-bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-[20px]"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pr-8">
          <h2
            id="cook-memory-title"
            className="font-display text-xl tracking-wide"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm leading-snug text-text-secondary">
            Rate your recipe or add details about what you cooked, why you
            cooked it, and who you cooked for.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              RATING
            </p>
            <div
              className="mt-1.5 flex items-center gap-1"
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
                    onClick={() =>
                      setRating((prev) => (prev === value ? null : value))
                    }
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      active ? "text-text-primary" : "text-text-secondary/40"
                    )}
                  >
                    <Star
                      className={cn("h-6 w-6", active && "fill-current")}
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            <p className="mt-0.5 min-h-[1.1rem] text-[12px] text-text-secondary">
              {rating != null
                ? RATING_LABELS[rating]
                : "Optional · tap again to clear"}
            </p>
          </div>

          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              NOTE
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What to change next time…"
              maxLength={280}
              rows={3}
              className="mt-1.5 min-h-[5.5rem] w-full resize-none rounded-2xl border border-border-hairline bg-bg-primary p-3 text-base leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              DATE
            </span>
            <input
              type="date"
              value={cookedOn}
              max={toDateInputValue(new Date().toISOString())}
              onChange={(event) => setCookedOn(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-full border border-border-hairline bg-bg-primary px-4 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              OCCASION
            </span>
            <input
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
              placeholder="Mom’s birthday, Sunday dinner…"
              maxLength={80}
              className="mt-1.5 h-11 w-full rounded-full border border-border-hairline bg-bg-primary px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            />
          </label>

          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              WHO YOU COOKED FOR
            </p>
            {who.length ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {who.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-bg-primary py-1.5 pl-3 pr-1.5 text-sm"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() =>
                        setWho((prev) => prev.filter((item) => item !== name))
                      }
                      className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <form
              className={cn("flex gap-2", who.length ? "mt-2" : "mt-1.5")}
              onSubmit={(event) => {
                event.preventDefault();
                commitWhoDraft();
              }}
            >
              <input
                value={whoDraft}
                onChange={(event) => setWhoDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "," || event.key === "Enter") {
                    event.preventDefault();
                    commitWhoDraft();
                  }
                }}
                placeholder="Add a name…"
                maxLength={40}
                className="h-11 min-w-0 flex-1 rounded-full border border-border-hairline bg-bg-primary px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              />
              <button
                type="submit"
                disabled={!whoDraft.trim()}
                className="inline-flex h-11 shrink-0 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-bg-primary disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
