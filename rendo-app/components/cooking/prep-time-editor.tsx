"use client";

import { useEffect, useState } from "react";

type Props = {
  minutes: number;
  onSave: (minutes: number) => Promise<void>;
};

export function PrepTimeEditor({ minutes, onSave }: Props) {
  const [value, setValue] = useState(String(minutes));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(minutes));
  }, [minutes]);

  async function commit() {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValue(String(minutes));
      return;
    }
    const next = Math.min(parsed, 24 * 60);
    if (next === minutes) {
      setValue(String(next));
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-baseline gap-1 px-4 pt-1">
      <label className="sr-only" htmlFor="recipe-prep-time">
        Cook time in minutes
      </label>
      <input
        id="recipe-prep-time"
        type="text"
        inputMode="numeric"
        value={value}
        disabled={saving}
        size={Math.max(1, value.length)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setValue(String(minutes));
            e.currentTarget.blur();
          }
        }}
        className="min-w-[1ch] max-w-[5ch] bg-transparent text-[14px] font-semibold tabular-nums text-text-secondary outline-none focus-visible:underline focus-visible:decoration-border-hairline focus-visible:underline-offset-4 disabled:opacity-60"
        style={{ width: `${Math.max(1, value.length)}ch` }}
      />
      <span className="text-[14px] text-text-secondary">Mins</span>
    </div>
  );
}
