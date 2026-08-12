"use client";

import type { Recipe } from "@/lib/db/types";

type Props = {
  recipe: Recipe;
};

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function RecipeSource({ recipe }: Props) {
  const url = recipe.source_url?.trim() || null;
  const handle = recipe.source_handle?.trim() || null;
  const host = url ? hostFromUrl(url) : null;

  if (!url && !handle) return null;

  const via =
    handle && handle !== host
      ? handle.startsWith("@") || handle.includes(".")
        ? handle
        : `@${handle}`
      : host || handle;

  return (
    <section
      className="mt-8 border-t border-border-hairline px-4 pb-12 pt-6"
      aria-label="Recipe source"
    >
      <h2 className="font-display text-[11px] tracking-[0.14em] text-text-secondary">
        SOURCE
      </h2>
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
    </section>
  );
}
