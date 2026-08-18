"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CookMemory } from "@/lib/db/cook-events";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (memory: CookMemory) => Promise<void>;
  initialDate?: string | null;
};

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

export function CookMemorySheet({ open, onClose, onSave, initialDate }: Props) {
  const [cookedOn, setCookedOn] = useState(toDateInputValue(initialDate));
  const [occasion, setOccasion] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [whoDraft, setWhoDraft] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCookedOn(toDateInputValue(initialDate));
    setOccasion("");
    setWho([]);
    setWhoDraft("");
    setNote("");
    setSaving(false);
  }, [open, initialDate]);

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
    };
    setSaving(true);
    try {
      await onSave(memory);
    } finally {
      setSaving(false);
    }
  }

  const sheet = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Dismiss memory"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cook-memory-title"
        className="relative z-10 mx-auto w-full max-w-lg rounded-t-[20px] border border-border-hairline bg-bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-[20px]"
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
            Add a memory
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            The date, who you cooked for, and what you’d change next time.
          </p>
        </div>

        <label className="mt-5 block">
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

        <label className="mt-4 block">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
            OCCASION
          </span>
          <input
            value={occasion}
            onChange={(event) => setOccasion(event.target.value)}
            placeholder="Mom’s birthday, Sunday dinner…"
            maxLength={80}
            autoFocus
            className="mt-1.5 h-11 w-full rounded-full border border-border-hairline bg-bg-primary px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          />
        </label>

        <div className="mt-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
            WHO YOU COOKED FOR
          </p>
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
          <form
            className="mt-2 flex gap-2"
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

        <label className="mt-4 block">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
            NOTE
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Doubled the garlic, better this way"
            maxLength={280}
            rows={3}
            className="mt-1.5 min-h-[5.5rem] w-full resize-none rounded-2xl border border-border-hairline bg-bg-primary p-3 text-base leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            disabled={saving}
            onClick={onClose}
          >
            Not now
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            Save memory
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
