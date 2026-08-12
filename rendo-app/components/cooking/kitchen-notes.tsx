"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KitchenNote } from "@/lib/db/types";

type Props = {
  notes: KitchenNote[];
  onSave: (text: string) => Promise<void>;
  onUpdate: (noteId: string, text: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
};

function formatNoteDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function KitchenNotes({ notes, onSave, onUpdate, onDelete }: Props) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function handleUpdate(noteId: string) {
    if (!editDraft.trim()) return;
    setBusyId(noteId);
    try {
      await onUpdate(noteId, editDraft);
      setEditingId(null);
      setEditDraft("");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(noteId: string) {
    setBusyId(noteId);
    try {
      await onDelete(noteId);
      if (editingId === noteId) {
        setEditingId(null);
        setEditDraft("");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="border-t border-border-hairline px-4 py-6 pb-10">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
        KITCHEN NOTES
      </h2>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a personal note…"
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
        <ul className="mt-4 space-y-3">
          {[...notes].reverse().map((note) => {
            const editing = editingId === note.id;
            const busy = busyId === note.id;
            return (
              <li
                key={note.id}
                className="rounded-2xl border border-border-hairline bg-bg-surface p-3"
              >
                {editing ? (
                  <>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="min-h-20 w-full resize-y rounded-xl border border-border-hairline bg-bg-primary p-2.5 text-sm leading-relaxed text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
                      autoFocus
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs text-text-secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-text-primary px-3 text-xs font-medium text-bg-primary disabled:opacity-50"
                        disabled={busy || !editDraft.trim()}
                        onClick={() => void handleUpdate(note.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-primary">
                        {note.text}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label="Edit note"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-primary hover:text-text-primary"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(note.id);
                            setEditDraft(note.text);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete note"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-primary hover:text-accent-alert"
                          disabled={busy}
                          onClick={() => void handleDelete(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-secondary">
                      {formatNoteDate(note.created_at)}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
