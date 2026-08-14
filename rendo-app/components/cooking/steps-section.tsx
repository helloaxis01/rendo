"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { RecipeStep } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { StepTimer } from "@/components/cooking/step-timer";

type Props = {
  steps: RecipeStep[];
  recipeId: string;
  recipeTitle: string;
  onSave: (steps: RecipeStep[]) => Promise<void>;
};

export function StepsSection({ steps, recipeId, recipeTitle, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecipeStep[]>(steps);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  useEffect(() => {
    if (!editing) setDraft(steps);
  }, [steps, editing]);

  async function commit() {
    const cleaned = draft
      .map((step, index) => ({
        ...step,
        step_number: index + 1,
        instruction: step.instruction.trim(),
        action_header: "",
      }))
      .filter((step) => step.instruction.length > 0);
    setSaving(true);
    try {
      await onSave(cleaned);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(stepNumber: number, patch: Partial<RecipeStep>) {
    setDraft((prev) =>
      prev.map((step) =>
        step.step_number === stepNumber ? { ...step, ...patch } : step
      )
    );
  }

  function removeDraft(stepNumber: number) {
    setDraft((prev) =>
      prev
        .filter((step) => step.step_number !== stepNumber)
        .map((step, index) => ({ ...step, step_number: index + 1 }))
    );
  }

  function addDraft() {
    setDraft((prev) => [
      ...prev,
      {
        step_number: prev.length + 1,
        action_header: "",
        instruction: "",
        timer_seconds: null,
      },
    ]);
  }

  return (
    <section className="border-t border-border-hairline px-4 pt-6 pb-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary">
          STEPS
        </h2>
        {editing ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-[12px] text-text-secondary"
              disabled={saving}
              onClick={() => {
                setDraft(steps);
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
            aria-label="Edit steps"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary hover:text-text-primary"
            onClick={() => {
              setDraft(steps);
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <ul className="space-y-5">
          {draft.map((step, index) => (
            <li key={step.step_number} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-text-secondary">
                  Step {index + 1}
                </p>
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:text-accent-alert"
                  onClick={() => removeDraft(step.step_number)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                aria-label={`Step ${index + 1} instruction`}
                placeholder="Instruction…"
                value={step.instruction}
                onChange={(e) =>
                  updateDraft(step.step_number, {
                    instruction: e.target.value,
                  })
                }
                rows={3}
                className="w-full resize-y rounded-lg border border-border-hairline bg-bg-surface px-3 py-2 text-[15px] leading-relaxed text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
              />
            </li>
          ))}
          <li>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
              onClick={addDraft}
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          </li>
        </ul>
      ) : (
        <ol className="space-y-6">
          {steps.map((step) => {
            const active = activeStep === step.step_number;
            const dimmed = activeStep != null && !active;
            return (
              <li key={step.step_number} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setActiveStep((prev) =>
                      prev === step.step_number ? null : step.step_number
                    )
                  }
                  className={cn(
                    "w-full overflow-hidden rounded-xl text-left transition-[opacity] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
                    dimmed && "opacity-40"
                  )}
                >
                  <p className="font-display text-[13px] leading-none tracking-tight text-text-secondary">
                    {String(step.step_number).padStart(2, "0")}
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 break-words leading-relaxed text-text-primary transition-[font-size] duration-200 ease-out",
                      active ? "text-[20px] font-medium" : "text-[16px]"
                    )}
                  >
                    {step.instruction}
                  </p>
                </button>
                {step.timer_seconds ? (
                  <StepTimer
                    compact
                    recipeId={recipeId}
                    recipeTitle={recipeTitle}
                    stepNumber={step.step_number}
                    stepLabel={step.instruction.slice(0, 48)}
                    timerSeconds={step.timer_seconds}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
