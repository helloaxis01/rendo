"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, List, X } from "lucide-react";
import type { Ingredient, RecipeStep } from "@/lib/db/types";
import { hapticLight } from "@/lib/native/haptics";
import { useKeepAwake } from "@/lib/native/use-keep-awake";
import {
  convertAmount,
  formatAmount,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";
import { KeepAwakeBar } from "@/components/cooking/keep-awake-bar";
import { StepTimer } from "@/components/cooking/step-timer";
import { typeCoverStyle } from "@/lib/type-cover-color";
import { cn } from "@/lib/utils";

type Phase = "start" | "step" | "fade" | "done";

type Props = {
  open: boolean;
  recipeId: string;
  title: string;
  steps: RecipeStep[];
  ingredients: Ingredient[];
  servingsBase: number;
  servings: number;
  unitSystem: UnitSystem;
  keepAwakeDefault: boolean;
  onClose: () => void;
  onComplete?: () => void;
};

const SWIPE_THRESHOLD = 56;
const TAP_SLOP = 12;

export function CookingMode({
  open,
  recipeId,
  title,
  steps,
  ingredients,
  servingsBase,
  servings,
  unitSystem,
  keepAwakeDefault,
  onClose,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("start");
  const [index, setIndex] = useState(0);
  const [keepAwake, setKeepAwake] = useState(keepAwakeDefault);
  const [peekOpen, setPeekOpen] = useState(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const keepAwakeDefaultRef = useRef(keepAwakeDefault);
  keepAwakeDefaultRef.current = keepAwakeDefault;

  const fadeTimer = useRef<number | null>(null);

  useKeepAwake(open && keepAwake);

  useEffect(() => {
    if (!open) return;
    setPhase("start");
    setIndex(0);
    setKeepAwake(keepAwakeDefaultRef.current);
    setPeekOpen(false);
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
  }, [open, recipeId]);

  useEffect(() => {
    return () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.dataset.cookingOpen = "true";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      delete html.dataset.cookingOpen;
    };
  }, [open]);

  const total = steps.length;
  const step = steps[index] ?? null;

  const goTo = useCallback(
    (nextIndex: number) => {
      if (phase === "fade" || phase === "done") return;
      if (nextIndex < 0) {
        setPhase("start");
        return;
      }
      if (nextIndex >= total) {
        if (phase === "step") {
          void hapticLight();
          onComplete?.();
          setPhase("fade");
          if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
          fadeTimer.current = window.setTimeout(() => setPhase("done"), 480);
        }
        return;
      }
      if (nextIndex !== index) void hapticLight();
      setIndex(nextIndex);
      setPhase("step");
    },
    [index, total, onComplete, phase]
  );

  function handlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent) {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || peekOpen || phase === "fade") return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goTo(index + 1);
      else goTo(index - 1);
      return;
    }
    if (Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left + rect.width / 2) goTo(index - 1);
      else goTo(index + 1);
    }
  }

  if (!open) return null;

  const ui = (
    <div
      className="fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden overscroll-none bg-bg-primary pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
      role="dialog"
      aria-modal="true"
      data-state="open"
      data-cooking-mode=""
      aria-label="Cooking mode"
    >
      {phase === "done" ? (
        <CookingDone recipeId={recipeId} onClose={onClose} />
      ) : (
        <>
      <div className="h-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))] shrink-0 landscape:h-[env(safe-area-inset-top,0px)]" />

      {phase === "step" && total > 0 ? (
        <div className="h-0.5 w-full shrink-0 bg-bg-muted" aria-hidden>
          <div
            className="h-full bg-text-primary transition-[width] duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      ) : null}

      <div className="flex h-14 shrink-0 items-center justify-between px-3 landscape:h-11">
        {phase === "step" && total > 0 ? (
          <p className="px-1 text-[13px] font-medium tabular-nums text-text-secondary">
            Step {index + 1} of {total}
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          {phase === "step" ? (
            <button
              type="button"
              aria-label="Ingredients"
              onClick={() => setPeekOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-primary"
            >
              <List className="h-5 w-5" strokeWidth={2} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Exit cooking"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-primary"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {phase === "start" ? (
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] landscape:flex-row landscape:items-center landscape:gap-12 landscape:px-10">
          <div className="flex flex-1 flex-col items-center justify-center text-center landscape:items-start landscape:text-left">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-text-secondary">
              COOKING
            </p>
            <h1 className="mt-3 max-w-[20ch] font-display text-[34px] leading-[1.05] tracking-tight text-text-primary sm:text-[40px] landscape:text-[40px]">
              {title}
            </h1>
            {total > 0 ? (
              <p className="mt-4 text-[16px] text-text-secondary">
                {total} {total === 1 ? "step" : "steps"}
              </p>
            ) : (
              <p className="mt-4 text-[16px] text-text-secondary">
                Add steps on the recipe to cook through them here.
              </p>
            )}
          </div>
          <div className="w-full shrink-0 landscape:w-[min(22rem,42%)]">
            <KeepAwakeBar
              enabled={keepAwake}
              onEnabledChange={setKeepAwake}
              className="mx-[-0.5rem] mb-5 landscape:mx-0"
            />
            <button
              type="button"
              disabled={total === 0}
              onClick={() => {
                void hapticLight();
                setIndex(0);
                setPhase("step");
              }}
              className="flex h-14 w-full items-center justify-center rounded-full bg-text-primary text-[17px] font-semibold text-bg-primary disabled:opacity-40 landscape:h-16"
            >
              Begin
            </button>
          </div>
        </div>
      ) : step ? (
        <>
          <div
            className="flex min-h-0 flex-1 touch-pan-y select-none flex-col justify-start overflow-hidden px-6 landscape:grid landscape:grid-cols-[auto_minmax(0,1fr)] landscape:grid-rows-[minmax(0,1fr)] landscape:items-start landscape:gap-x-10 landscape:px-8 landscape:[grid-template-areas:'numeral_copy']"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerRef.current = null;
            }}
          >
            <p className="font-display text-[44px] leading-none tracking-tight text-text-primary sm:text-[52px] landscape:[grid-area:numeral] landscape:text-[56px]">
              {String(step.step_number).padStart(2, "0")}
            </p>
            <p className="mt-5 max-w-prose text-[42px] font-medium leading-[1.22] text-text-primary sm:text-[46px] landscape:mt-0 landscape:self-center landscape:text-[42px] landscape:leading-[1.22] landscape:[grid-area:copy]">
              {step.instruction}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1">
            {step.timer_seconds ? (
              <div className="mb-2 flex justify-center">
                <StepTimer
                  recipeId={recipeId}
                  recipeTitle={title}
                  stepNumber={step.step_number}
                  stepLabel={step.instruction.slice(0, 48)}
                  timerSeconds={step.timer_seconds}
                />
              </div>
            ) : null}
            <div className="flex w-full items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Go back"
              onClick={() => goTo(index - 1)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-primary"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2} />
            </button>
            <p className="min-w-0 text-center text-[12px] text-text-secondary">
              Tap or swipe to go back or advance
            </p>
            <button
              type="button"
              aria-label={index >= total - 1 ? "Finish cooking" : "Advance"}
              onClick={() => goTo(index + 1)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-primary"
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2} />
            </button>
            </div>
          </div>
        </>
      ) : null}

      {peekOpen ? (
        <IngredientPeek
          ingredients={ingredients}
          servingsBase={servingsBase}
          servings={servings}
          unitSystem={unitSystem}
          onClose={() => setPeekOpen(false)}
        />
      ) : null}
      {phase === "fade" ? (
        <div className="rendo-cook-fade pointer-events-none absolute inset-0 z-[100]" />
      ) : null}
        </>
      )}
    </div>
  );

  if (typeof document === "undefined") return ui;
  return createPortal(ui, document.body);
}

function CookingDone({
  recipeId,
  onClose,
}: {
  recipeId: string;
  onClose: () => void;
}) {
  const type = typeCoverStyle(recipeId);
  return (
    <div className="absolute inset-0">
      <div
        className="rendo-done-field absolute inset-0"
        style={{ "--rendo-cover-accent": type.accent } as CSSProperties}
      />
      <div className="rendo-done-reveal pointer-events-none absolute inset-0 z-[5]" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="h-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))] shrink-0 landscape:h-[env(safe-area-inset-top,0px)]" />
        <div className="rendo-done-copy flex min-h-0 flex-1 flex-col items-center px-8 pb-[max(3.5rem,env(safe-area-inset-bottom))] text-center">
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="rendo-done-title font-display text-[52px] font-bold leading-none tracking-tight sm:text-[64px]">
              DONE!
            </p>
            <p className="mt-6 bg-white px-5 py-2.5 text-[17px] leading-snug text-black shadow-sm dark:bg-black dark:text-white sm:text-[19px]">
              Enjoy your food.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-text-primary px-4 py-2 text-[11px] font-bold tracking-[0.08em] text-bg-primary"
          >
            BACK TO RECIPE
          </button>
        </div>
      </div>
    </div>
  );
}

function IngredientPeek({
  ingredients,
  servingsBase,
  servings,
  unitSystem,
  onClose,
}: {
  ingredients: Ingredient[];
  servingsBase: number;
  servings: number;
  unitSystem: UnitSystem;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end landscape:flex-row landscape:justify-end">
      <button
        type="button"
        aria-label="Close ingredients"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Ingredients"
        className="relative max-h-[72vh] overflow-y-auto rounded-t-[20px] bg-bg-primary px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 landscape:h-full landscape:max-h-none landscape:w-[min(26rem,88vw)] landscape:rounded-none landscape:rounded-l-[20px] landscape:pb-6 landscape:pt-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-hairline landscape:hidden" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
            INGREDIENTS
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-text-secondary"
          >
            Close
          </button>
        </div>
        <ul>
          {ingredients.map((ing) => {
            const amount = scaleAmount(ing.amount, servingsBase, servings);
            const converted = convertAmount(amount, ing.unit, unitSystem);
            const amountLabel = formatAmount(converted.amount, converted.unit);
            const unitLabel = converted.unit?.trim() ?? "";
            const measure = [amountLabel, unitLabel].filter(Boolean).join(" ");
            return (
              <li
                key={ing.id}
                className={cn(
                  "flex items-baseline gap-3 border-b border-border-hairline py-3.5 text-[17px]",
                  ing.checked
                    ? "text-text-secondary line-through opacity-50"
                    : "text-text-primary"
                )}
              >
                {measure ? (
                  <span className="shrink-0 font-semibold tabular-nums">
                    {measure}
                  </span>
                ) : null}
                <span className="min-w-0">{ing.name}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
