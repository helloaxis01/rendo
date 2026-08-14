"use client";

import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import { LibraryStatusLine } from "@/components/library/library-status-line";
import type { Recipe, TagRecord } from "@/lib/db/types";

type Props = {
  onCapture: () => void;
  recipes: Recipe[];
  tags: TagRecord[];
  ready: boolean;
};

export function LibraryHeader({ onCapture, recipes, tags, ready }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-bg-primary pt-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))]">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-none tracking-tight">
            RENDO
          </h1>
          <LibraryStatusLine recipes={recipes} tags={tags} ready={ready} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Capture recipe"
            onClick={onCapture}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-text-primary text-bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-surface text-text-secondary ring-1 ring-border-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          >
            <Settings className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  );
}
