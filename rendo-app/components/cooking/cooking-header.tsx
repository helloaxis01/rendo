"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeRecipeSession } from "@/lib/nav/recipe-session";
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

function CircleControl({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-muted text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
        className
      )}
      {...props}
    />
  );
}

function FrostedCircleControl({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-primary/90 text-text-primary shadow-sm backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
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
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back to library"
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={() => {
        closeRecipeSession();
        router.replace("/");
      }}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full bg-bg-primary/90 text-text-primary shadow-sm backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
        className
      )}
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}

type CoverActionsProps = {
  onPrint?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  deleting?: boolean;
  className?: string;
};

export function CookingCoverActions({
  onPrint,
  onDelete,
  onShare,
  deleting = false,
  className,
}: CoverActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <FrostedCircleControl
          aria-label="More options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal className="h-5 w-5" />
        </FrostedCircleControl>
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
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary"
                  onClick={() => {
                    onPrint();
                    setMenuOpen(false);
                    setConfirmDelete(false);
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Print / Save PDF
                </button>
              )}
              {onDelete && (
                <>
                  {onPrint && (
                    <div className="my-1 border-t border-border-hairline" />
                  )}
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
        <FrostedCircleControl aria-label="Share ingredients" onClick={onShare}>
          <Share className="h-4 w-4" />
        </FrostedCircleControl>
      )}
    </div>
  );
}

function UnitToggle({
  unitSystem,
  onUnitSystemChange,
}: {
  unitSystem: UnitSystem;
  onUnitSystemChange: (s: UnitSystem) => void;
}) {
  return (
    <div
      className="inline-flex h-9 shrink-0 items-center rounded-full bg-bg-muted p-0.5"
      role="group"
      aria-label="Unit system"
    >
      {(
        [
          ["imperial", "US"],
          ["metric", "Metric"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={unitSystem === value}
          onClick={() => onUnitSystemChange(value)}
          className={cn(
            "h-8 rounded-full px-2.5 text-[11px] font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
            unitSystem === value
              ? "bg-text-primary text-bg-primary"
              : "text-text-secondary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type ServingsProps = {
  servings: number;
  onServingsChange: (n: number) => void;
  unitSystem: UnitSystem;
  onUnitSystemChange: (s: UnitSystem) => void;
};

export function ServingsMenuControls({
  servings,
  onServingsChange,
  unitSystem,
  onUnitSystemChange,
}: ServingsProps) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
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

      <UnitToggle
        unitSystem={unitSystem}
        onUnitSystemChange={onUnitSystemChange}
      />
    </div>
  );
}

type CookDashboardProps = ServingsProps & {
  onStartCooking: () => void;
};

export function CookDashboard({
  onStartCooking,
  servings,
  onServingsChange,
  unitSystem,
  onUnitSystemChange,
}: CookDashboardProps) {
  return (
    <section className="relative z-20 px-4 pt-5">
      <div className="rounded-[22px] border border-border-hairline bg-bg-surface">
        <div className="p-3.5">
          <button
            type="button"
            onClick={onStartCooking}
            className="flex h-12 w-full items-center justify-center rounded-full bg-text-primary text-[15px] font-semibold text-bg-primary"
          >
            Start Cooking
          </button>
        </div>
        <div className="border-t border-border-hairline px-3.5 py-3">
          <ServingsMenuControls
            servings={servings}
            onServingsChange={onServingsChange}
            unitSystem={unitSystem}
            onUnitSystemChange={onUnitSystemChange}
          />
        </div>
      </div>
    </section>
  );
}
