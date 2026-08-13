"use client";

import Link from "next/link";
import { Plus, Settings } from "lucide-react";

type Props = {
  onCapture: () => void;
};

export function LibraryHeader({ onCapture }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-bg-primary pt-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))]">
      <div className="flex h-14 items-center justify-between px-4">
        <h1 className="font-display text-[22px] leading-none tracking-tight">
          RENDO
        </h1>
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
