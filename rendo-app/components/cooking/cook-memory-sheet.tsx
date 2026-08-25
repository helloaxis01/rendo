"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, Plus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CookMemory } from "@/lib/db/cook-events";
import {
  maxMemoryPhotos,
  resolveMemoryPhotoUrl,
} from "@/lib/db/memory-photos";
import {
  listCookWhoNames,
  rememberCookWhoNames,
} from "@/lib/db/cook-who";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  canUseNativeCamera,
  isImagePickCanceled,
  pickNativeImage,
  pickNativeImages,
} from "@/lib/native/pick-image";
import { hapticLight, hapticMedium } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

export type CookSessionSave = {
  memory: CookMemory;
};

type Props = {
  open: boolean;
  recipeId: string;
  onClose: () => void;
  onSave: (payload: CookSessionSave) => Promise<void>;
  /** Prefill when editing an existing cook log entry. */
  initial?: {
    cooked_at?: string | null;
    rating?: number | null;
    occasion?: string | null;
    who?: string[];
    note?: string | null;
    photo_urls?: string[];
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
  recipeId,
  onClose,
  onSave,
  initial = null,
  title = "Memory Log",
}: Props) {
  const auth = useAuth();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [cookedOn, setCookedOn] = useState(toDateInputValue(null));
  const [rating, setRating] = useState<number | null>(null);
  const [occasion, setOccasion] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [whoDraft, setWhoDraft] = useState("");
  const [whoSuggestions, setWhoSuggestions] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCookedOn(toDateInputValue(initial?.cooked_at));
    setRating(initial?.rating ?? null);
    setOccasion(initial?.occasion?.trim() ?? "");
    setWho(initial?.who ?? []);
    setWhoDraft("");
    setNote(initial?.note?.trim() ?? "");
    setPhotoUrls(initial?.photo_urls ?? []);
    setPicking(false);
    setSaving(false);
    setPhotoError(null);
    void listCookWhoNames().then(setWhoSuggestions);
  }, [open, initial]);

  if (!open || typeof document === "undefined") return null;

  const slotsLeft = maxMemoryPhotos() - photoUrls.length;

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

  async function attachFiles(files: File[]) {
    if (!files.length || slotsLeft <= 0) return;
    setPicking(true);
    setPhotoError(null);
    try {
      const next: string[] = [];
      for (const file of files.slice(0, slotsLeft)) {
        const url = await resolveMemoryPhotoUrl({
          file,
          recipeId,
          userId: auth.user?.id ?? null,
        });
        next.push(url);
      }
      setPhotoUrls((prev) => [...prev, ...next].slice(0, maxMemoryPhotos()));
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : "Couldn’t add that photo."
      );
    } finally {
      setPicking(false);
    }
  }

  async function pickFromCamera() {
    if (picking || slotsLeft <= 0) return;
    if (canUseNativeCamera()) {
      setPicking(true);
      setPhotoError(null);
      try {
        const file = await pickNativeImage("camera");
        await attachFiles([file]);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          setPhotoError(
            err instanceof Error ? err.message : "Couldn’t open the camera."
          );
        }
        setPicking(false);
      }
      return;
    }
    cameraInputRef.current?.click();
  }

  async function pickFromLibrary() {
    if (picking || slotsLeft <= 0) return;
    if (canUseNativeCamera()) {
      setPicking(true);
      setPhotoError(null);
      try {
        const files = await pickNativeImages(slotsLeft);
        await attachFiles(files);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          setPhotoError(
            err instanceof Error ? err.message : "Couldn’t open photos."
          );
        }
        setPicking(false);
      }
      return;
    }
    libraryInputRef.current?.click();
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
      photo_urls: photoUrls,
    };
    setSaving(true);
    try {
      if (nextWho.length) {
        const remembered = await rememberCookWhoNames(nextWho);
        setWhoSuggestions(remembered);
      }
      await onSave({ memory });
      void hapticMedium();
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

        <div className="mt-5 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
                RATING
              </p>
              <p className="text-[11px] text-text-secondary">
                {rating != null
                  ? RATING_LABELS[rating]
                  : "Optional · tap again to clear"}
              </p>
            </div>
            <div
              className="flex items-center gap-1"
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
                      void hapticLight();
                      setRating((prev) => (prev === value ? null : value));
                    }}
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
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
                PHOTOS
              </p>
              <p className="text-[11px] text-text-secondary">
                Optional · up to {maxMemoryPhotos()}
              </p>
            </div>
            {photoUrls.length ? (
              <div className="flex flex-wrap gap-2">
                {photoUrls.map((url) => (
                  <div
                    key={url}
                    className="relative h-20 w-20 overflow-hidden rounded-xl border border-border-hairline bg-bg-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      disabled={saving || picking}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                      onClick={() =>
                        setPhotoUrls((prev) => prev.filter((item) => item !== url))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {slotsLeft > 0 ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving || picking}
                  onClick={() => void pickFromCamera()}
                  className="flex w-full items-start gap-3 rounded-md border border-border-hairline bg-bg-primary px-4 py-3 text-left transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  <Camera className="mt-0.5 h-5 w-5 shrink-0 text-text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-text-primary">
                      Take Photos
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-text-secondary">
                      The plated dish or a moment from this cook
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={saving || picking}
                  onClick={() => void pickFromLibrary()}
                  className="flex w-full items-start gap-3 rounded-md border border-border-hairline bg-bg-primary px-4 py-3 text-left transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-text-primary">
                      Photo from Library
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-text-secondary">
                      {picking
                        ? "Adding…"
                        : `Add up to ${slotsLeft} more`}
                    </span>
                  </span>
                </button>
              </div>
            ) : null}
            {photoError ? (
              <p className="text-[13px] text-accent-alert">{photoError}</p>
            ) : null}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attachFiles([file]);
              }}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length) void attachFiles(files);
              }}
            />
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              NOTE
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What to change next time…"
              maxLength={280}
              rows={3}
              className="m-0 block min-h-[5.5rem] w-full resize-none rounded-2xl border border-border-hairline bg-bg-primary p-3 text-base leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              DATE
            </span>
            <input
              type="date"
              value={cookedOn}
              max={toDateInputValue(new Date().toISOString())}
              onChange={(event) => setCookedOn(event.target.value)}
              className="m-0 box-border flex h-11 w-full appearance-none items-center rounded-full border border-border-hairline bg-bg-primary px-4 text-base leading-none text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-date-and-time-value]:min-h-0 [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit]:h-full [&::-webkit-datetime-edit]:items-center [&::-webkit-datetime-edit]:p-0"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              OCCASION
            </span>
            <input
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
              placeholder="Mom’s birthday, Sunday dinner…"
              maxLength={80}
              className="m-0 box-border block h-11 w-full rounded-full border border-border-hairline bg-bg-primary px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            />
          </label>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
              WHO YOU COOKED FOR
            </p>
            {who.length ? (
              <div className="flex flex-wrap gap-2">
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
            {(() => {
              const selected = new Set(who.map((name) => name.toLowerCase()));
              const draftKey = whoDraft.trim().toLowerCase();
              const suggestions = whoSuggestions.filter((name) => {
                const key = name.toLowerCase();
                if (selected.has(key)) return false;
                if (!draftKey) return true;
                return key.includes(draftKey);
              });
              return suggestions.length ? (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => addWho(name)}
                      className="rounded-full border border-dashed border-border-hairline bg-bg-primary px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
            <form
              className="m-0 flex gap-2"
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
                className="m-0 box-border block h-11 min-w-0 flex-1 rounded-full border border-border-hairline bg-bg-primary px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              />
              <button
                type="submit"
                aria-label="Add name"
                disabled={!whoDraft.trim()}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-text-primary text-bg-primary disabled:opacity-50"
              >
                <Plus className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            disabled={saving || picking}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={saving || picking}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
