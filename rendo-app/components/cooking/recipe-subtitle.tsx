"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null | undefined;
  onSave: (next: string | null) => Promise<void>;
  iconOnly?: boolean;
  placeholder?: string;
  align?: "center" | "start";
};

export function RecipeSubtitle({
  value,
  onSave,
  iconOnly = false,
  placeholder = "Add your own About here",
  align = "center",
}: Props) {
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
      <div
        className={cn(
          "relative z-10 mt-1 flex w-full max-w-[22rem] items-center gap-1",
          align === "center" && "mx-auto"
        )}
      >
        <input
          autoFocus
          value={draft}
          disabled={saving}
          aria-label="Recipe About"
          placeholder={placeholder}
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
          className={cn(
            "min-w-0 flex-1 bg-transparent text-base leading-snug text-current outline-none placeholder:text-text-secondary/70",
            align === "center" ? "text-center" : "text-left"
          )}
        />
      </div>
    );
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        aria-label={current ? "Edit About" : "Add About"}
        onClick={() => setEditing(true)}
        className="relative z-10 mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-current opacity-80 hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={current ? "Edit About" : "Add About"}
      onClick={() => setEditing(true)}
      className={cn(
        "relative z-10 mt-1 flex w-full max-w-[22rem] items-center gap-1.5 text-left",
        align === "center" && "mx-auto justify-center text-center"
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate text-[15px] leading-snug sm:text-base",
          current ? "text-text-secondary" : "text-text-secondary/70"
        )}
      >
        {current || placeholder}
      </span>
      <Pencil
        className="h-3.5 w-3.5 shrink-0 text-text-secondary opacity-70"
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}
