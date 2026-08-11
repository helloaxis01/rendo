"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTED = [
  "Dinner",
  "Breakfast",
  "Lunch",
  "Quick Meals",
  "High Protein",
  "Vegetarian",
  "Pasta",
  "Seafood",
  "One Pan",
  "Dessert",
];

type Props = {
  tags: string[];
  vaultTags?: string[];
  onChange: (tags: string[]) => void | Promise<void>;
};

export function TagsSection({ tags, vaultTags = [], onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    const existing = new Set(tags.map((t) => t.toLowerCase()));
    const pool = [...SUGGESTED, ...vaultTags];
    const seen = new Set<string>();
    return pool.filter((tag) => {
      const key = tag.toLowerCase();
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
  }, [tags, vaultTags]);

  async function apply(next: string[]) {
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  }

  async function addTag(raw: string) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    await apply([...tags, tag]);
  }

  async function removeTag(tag: string) {
    await apply(tags.filter((t) => t !== tag));
  }

  return (
    <section className="border-t border-border-hairline px-4 py-6">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
        TAGS
      </h2>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-bg-surface py-1.5 pl-3 pr-1.5 text-sm"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              disabled={busy}
              onClick={() => void removeTag(tag)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {!tags.length && (
          <p className="text-sm text-text-secondary">No tags yet.</p>
        )}
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addTag(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a tag…"
          aria-label="Add tag"
          disabled={busy}
          className="h-11 min-w-0 flex-1 rounded-full border border-border-hairline bg-bg-surface px-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 text-sm font-medium text-bg-primary disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              disabled={busy}
              onClick={() => void addTag(tag)}
              className={cn(
                "rounded-full border border-dashed border-border-hairline px-3 py-1.5 text-xs text-text-secondary",
                "hover:border-text-primary hover:text-text-primary disabled:opacity-50"
              )}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
