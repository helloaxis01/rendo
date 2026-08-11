"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import type { RecipeStep } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Props = {
  steps: RecipeStep[];
  activeStep: number;
  onActiveStepChange: (n: number) => void;
};

export function StepsSection({
  steps,
  activeStep,
  onActiveStepChange,
}: Props) {
  return (
    <section className="px-4 pb-28 pt-8">
      <h2 className="mb-5 text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
        STEPS
      </h2>
      <ol className="space-y-8">
        {steps.map((step) => {
          const active = step.step_number === activeStep;
          return (
            <li key={step.step_number}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onActiveStepChange(step.step_number)}
              >
                {active ? (
                  <div className="space-y-3">
                    <p className="font-display text-[72px] leading-none tracking-tight text-text-primary sm:text-[88px]">
                      {step.step_number}
                    </p>
                    <h3 className="text-[22px] font-bold tracking-[0.04em] text-text-primary uppercase sm:text-[26px]">
                      {step.action_header}
                    </h3>
                    <p className="max-w-prose text-[16px] leading-[1.55] text-text-primary">
                      {step.instruction}
                    </p>
                    {step.timer_seconds ? (
                      <div className="pt-1">
                        <TimerChip seconds={step.timer_seconds} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1.5 text-text-secondary opacity-55">
                    <h3 className="text-[15px] font-bold tracking-[0.03em] uppercase">
                      {step.step_number}. {step.action_header}
                    </h3>
                    <p className="text-[14px] leading-relaxed">
                      {step.instruction}
                    </p>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TimerChip({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (remaining == null || remaining < 0) return;

    if (remaining === 0) {
      if (!doneRef.current) {
        doneRef.current = true;
        queueMicrotask(() => {
          setFlash(true);
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate([120, 60, 120, 60, 200]);
          }
        });
      }
      return;
    }

    const id = window.setTimeout(() => {
      setRemaining((r) => (r == null ? r : r - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  const label =
    remaining == null
      ? formatRestLabel(seconds)
      : remaining <= 0
        ? "DONE"
        : formatRestLabel(remaining);

  return (
    <button
      type="button"
      onClick={() => {
        doneRef.current = false;
        setFlash(false);
        setRemaining(seconds);
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-[#EBEAE6] px-3.5 py-2 text-sm font-medium text-text-primary dark:bg-bg-surface",
        flash && "timer-flash text-accent-alert"
      )}
    >
      <Clock className="h-4 w-4 text-text-secondary" />
      {label}
    </button>
  );
}

function formatRestLabel(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  if (m === 0) return `${s}s`;
  return s ? `${m} min ${s}s rest` : `${m} min rest`;
}
