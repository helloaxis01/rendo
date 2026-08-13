"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { RecipeStep } from "@/lib/db/types";
import { resolveActionHeader } from "@/lib/extract/action-header";

type Props = {
  steps: RecipeStep[];
  activeStep: number;
  onActiveStepChange: (n: number) => void;
  onSave: (steps: RecipeStep[]) => Promise<void>;
};

export function StepsSection({
  steps,
  activeStep,
  onActiveStepChange,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecipeStep[]>(steps);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(steps);
  }, [steps, editing]);

  async function commit() {
    const cleaned = draft
      .map((step, index) => {
        const instruction = step.instruction.trim();
        const header = step.action_header.trim();
        return {
          ...step,
          step_number: index + 1,
          instruction,
          action_header: resolveActionHeader(
            header || null,
            instruction,
            index
          ),
        };
      })
      .filter((step) => step.instruction.length > 0);
    setSaving(true);
    try {
      await onSave(cleaned);
      setEditing(false);
      if (cleaned.length) {
        onActiveStepChange(cleaned[0].step_number);
      }
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
    <section className="px-4 pt-6 pb-8">
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
              <input
                type="text"
                aria-label={`Step ${index + 1} header`}
                placeholder="ACTION HEADER"
                value={step.action_header}
                onChange={(e) =>
                  updateDraft(step.step_number, {
                    action_header: e.target.value.toUpperCase(),
                  })
                }
                className="w-full rounded-lg border border-border-hairline bg-bg-surface px-3 py-2 text-[13px] font-semibold tracking-wide text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
              />
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
                      <p className="font-sans text-[72px] font-semibold leading-none tracking-tight tabular-nums text-text-primary sm:text-[88px]">
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
      )}
    </section>
  );
}
