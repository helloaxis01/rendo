"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

type Props = {
  value: string | null | undefined;
  onSave: (next: string | null) => Promise<void>;
  iconOnly?: boolean;
};

export function RecipeSubtitle({ value, onSave, iconOnly = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const current = (value ?? "").trim();

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  async function commit() {
    const next = draft.replace(/\s+/g, " ").trim() || null;
    setSaving(true);
    try {
      if (next !== (current || null)) await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="relative z-10 mt-3 flex w-full max-w-[22rem] items-center gap-1">
        <input
          autoFocus
          value={draft}
          disabled={saving}
          maxLength={110}
          aria-label="Recipe subtitle"
          placeholder="One-line tagline"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-center text-[13px] leading-tight text-current outline-none placeholder:opacity-40 sm:text-sm"
        />
      </div>
    );
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        aria-label={current ? "Edit subtitle" : "Add subtitle"}
        onClick={() => setEditing(true)}
        className="relative z-10 mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-current opacity-80 hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="relative z-10 mt-3 flex max-w-[22rem] items-center justify-center gap-1 text-current">
      {current ? (
        <p className="min-w-0 truncate text-[13px] leading-tight opacity-90 sm:text-sm">
          {current}
        </p>
      ) : null}
      <button
        type="button"
        aria-label={current ? "Edit subtitle" : "Add subtitle"}
        onClick={() => setEditing(true)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
