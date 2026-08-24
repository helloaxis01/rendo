"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type { Recipe } from "@/lib/db/types";

type Props = {
  recipe: Recipe;
  onSave: (source: {
    handle: string | null;
    url: string | null;
  }) => Promise<void>;
};

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return null;
}

export function RecipeSource({ recipe, onSave }: Props) {
  const url = recipe.source_url?.trim() || null;
  const handle = recipe.source_handle?.trim() || null;
  const host = url ? hostFromUrl(url) : null;
  const [editing, setEditing] = useState(false);
  const [draftHandle, setDraftHandle] = useState(handle ?? "");
  const [draftUrl, setDraftUrl] = useState(url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraftHandle(handle ?? "");
      setDraftUrl(url ?? "");
    }
  }, [handle, url, editing]);

  const via =
    handle && handle !== host
      ? handle.startsWith("@") || handle.includes(".") || /\s/.test(handle)
        ? handle
        : `@${handle}`
      : host || handle;

  async function commit() {
    let nextHandle = draftHandle.trim();
    let nextUrl = normalizeUrl(draftUrl);

    if (!nextUrl && /^https?:\/\//i.test(nextHandle)) {
      nextUrl = nextHandle;
      nextHandle = hostFromUrl(nextHandle) || nextHandle;
    }

    setSaving(true);
    try {
      await onSave({
        handle: nextHandle || null,
        url: nextUrl,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="border-t border-border-hairline px-4 pb-6 pt-4"
      aria-label="Recipe source"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
          SOURCE
        </h2>
        {editing ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-[12px] text-text-secondary"
              disabled={saving}
              onClick={() => {
                setDraftHandle(handle ?? "");
                setDraftUrl(url ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-[12px] font-semibold text-text-primary"
              disabled={saving}
              onClick={() => void commit()}
            >
              {saving ? "Saving…" : "Done"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Edit source"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary hover:text-text-primary"
            onClick={() => {
              setDraftHandle(handle ?? "");
              setDraftUrl(url ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="block">
            <span className="sr-only">Source name</span>
            <input
              type="text"
              value={draftHandle}
              onChange={(e) => setDraftHandle(e.target.value)}
              placeholder="Cookbook, site, or @handle"
              className="w-full rounded-lg border border-border-hairline bg-bg-surface px-3 py-2.5 text-base text-text-primary outline-none placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
            />
          </label>
          <label className="block">
            <span className="sr-only">Source link</span>
            <input
              type="url"
              inputMode="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="Link (optional)"
              className="w-full rounded-lg border border-border-hairline bg-bg-surface px-3 py-2.5 text-base text-text-primary outline-none placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
            />
          </label>
        </div>
      ) : via || url ? (
        <>
          {via ? (
            <p className="mt-2 text-[14px] font-medium leading-snug text-text-primary">
              {via}
            </p>
          ) : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-[13px] leading-snug text-text-secondary underline decoration-border-hairline underline-offset-4 hover:text-text-primary hover:decoration-text-primary"
            >
              {url}
            </a>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[14px] leading-snug text-text-secondary">
          Add a cookbook, site, or handle
        </p>
      )}
    </section>
  );
}
