"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronLeft,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  Share,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnitSystem } from "@/lib/units";

type MenuProps = {
  unitSystem: UnitSystem;
  onUnitSystemChange: (s: UnitSystem) => void;
  onPrint?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  deleting?: boolean;
};

type ServingsProps = {
  servings: number;
  onServingsChange: (n: number) => void;
} & MenuProps;

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

export function CookingBackButton({
  className,
}: {
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Back to library"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-bg-primary/90 text-text-primary shadow-sm backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
        className
      )}
    >
      <ChevronLeft className="h-5 w-5" />
    </Link>
  );
}

export function ServingsMenuControls({
  servings,
  onServingsChange,
  unitSystem,
  onUnitSystemChange,
  onPrint,
  onDelete,
  onShare,
  deleting = false,
}: ServingsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex w-full items-center justify-between gap-3">
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

      <div className="flex items-center gap-2">
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
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(false);
                }}
              />
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-border-hairline bg-bg-surface py-1 shadow-lg">
                {onPrint && (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(false);
                        onPrint();
                      }}
                    >
                      <Printer className="h-4 w-4" />
                      Print / Save PDF
                    </button>
                    <div className="my-1 border-t border-border-hairline" />
                  </>
                )}
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
                      setConfirmDelete(false);
                    }}
                  >
                    {sys}
                  </button>
                ))}
                {onDelete && (
                  <>
                    <div className="my-1 border-t border-border-hairline" />
                    {!confirmDelete ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-accent-alert"
                        disabled={deleting}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete recipe
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 px-2 py-1.5">
                        <button
                          type="button"
                          className="flex-1 rounded-full px-2 py-2 text-sm text-text-secondary"
                          disabled={deleting}
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-full bg-accent-alert px-2 py-2 text-sm font-medium text-white disabled:opacity-50"
                          disabled={deleting}
                          onClick={() => {
                            onDelete();
                            setMenuOpen(false);
                            setConfirmDelete(false);
                          }}
                        >
                          {deleting ? "Deleting…" : "Confirm"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {onShare && (
          <CircleControl aria-label="Share ingredients" onClick={onShare}>
            <Share className="h-4 w-4" />
          </CircleControl>
        )}
      </div>
    </div>
  );
}
