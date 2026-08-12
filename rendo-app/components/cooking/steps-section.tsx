"use client";

import type { RecipeStep } from "@/lib/db/types";
import { resolveActionHeader } from "@/lib/extract/action-header";

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
    <section className="px-4 pt-6 pb-8">
      <h2 className="mb-5 text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
        STEPS
      </h2>
      <ol className="space-y-8">
        {steps.map((step, index) => {
          const active = step.step_number === activeStep;
          const header = resolveActionHeader(
            step.action_header,
            step.instruction,
            index
          );
          return (
            <li key={step.step_number}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onActiveStepChange(step.step_number)}
              >
                {active ? (
                  <>
                    <p className="font-display text-[72px] leading-none tracking-tight text-text-primary sm:text-[88px]">
                      {step.step_number}
                    </p>
                    <h3 className="mt-3 text-[22px] font-bold tracking-[0.04em] text-text-primary uppercase sm:text-[26px]">
                      {header}
                    </h3>
                    <p className="mt-3 max-w-prose text-[16px] leading-[1.55] text-text-primary">
                      {step.instruction}
                    </p>
                  </>
                ) : (
                  <div className="space-y-1.5 text-text-secondary opacity-55">
                    <h3 className="text-[15px] font-bold tracking-[0.03em] uppercase">
                      {step.step_number}. {header}
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
