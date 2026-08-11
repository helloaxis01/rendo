"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { KitchenNote } from "@/lib/db/types";

type Props = {
  notes: KitchenNote[];
  onSave: (text: string) => Promise<void>;
};

export function KitchenNotes({ notes, onSave }: Props) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-t border-border-hairline px-4 py-6 pb-28">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
        KITCHEN NOTES
      </h2>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) void handleSave();
        }}
        placeholder="Personal logs autosave with a date tag…"
        className="min-h-24 w-full resize-y rounded-2xl border border-border-hairline bg-bg-surface p-3 text-base leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={saving || !draft.trim()}
          onClick={() => void handleSave()}
        >
          Save note
        </Button>
      </div>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {[...notes].reverse().map((note) => (
            <li
              key={note.id}
              className="border-b border-border-hairline py-2 text-sm leading-relaxed text-text-secondary"
            >
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
