"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Minus, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnitSystem } from "@/lib/units";

type Props = {
  servings: number;
  onServingsChange: (n: number) => void;
  unitSystem: UnitSystem;
  onUnitSystemChange: (s: UnitSystem) => void;
};

function CircleControl({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EBEAE6] text-text-primary dark:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
        className
      )}
      {...props}
    />
  );
}

export function CookingHeader({
  servings,
  onServingsChange,
  unitSystem,
  onUnitSystemChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 bg-bg-primary/95 px-3 backdrop-blur-sm">
      <Link
        href="/"
        aria-label="Back to library"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EBEAE6] text-text-primary dark:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">Servings</span>
        <CircleControl
          aria-label="Decrease servings"
          onClick={() => onServingsChange(Math.max(1, servings - 1))}
        >
          <Minus className="h-4 w-4" />
        </CircleControl>
        <span className="min-w-5 text-center text-base font-semibold tabular-nums">
          {servings}
        </span>
        <CircleControl
          aria-label="Increase servings"
          onClick={() => onServingsChange(servings + 1)}
        >
          <Plus className="h-4 w-4" />
        </CircleControl>
      </div>

      <div className="relative">
        <CircleControl
          aria-label="More options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal className="h-5 w-5" />
        </CircleControl>
        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-border-hairline bg-bg-surface py-1 shadow-lg">
              <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-text-secondary">
                Units
              </p>
              {(["imperial", "metric"] as const).map((sys) => (
                <button
                  key={sys}
                  type="button"
                  className={cn(
                    "flex w-full px-3 py-2.5 text-left text-sm capitalize",
                    unitSystem === sys
                      ? "bg-text-primary text-bg-primary"
                      : "text-text-primary"
                  )}
                  onClick={() => {
                    onUnitSystemChange(sys);
                    setMenuOpen(false);
                  }}
                >
                  {sys}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
