"use client";

import { useEffect, useState } from "react";

type Props = {
  title: string;
  onSave: (title: string) => Promise<void>;
};

export function RecipeTitleEditor({ title, onSave }: Props) {
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(title);
  }, [title]);

  async function commit() {
    const next = value.trim();
    if (!next) {
      setValue(title);
      return;
    }
    if (next === title) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-5">
      <label className="sr-only" htmlFor="recipe-title">
        Recipe title
      </label>
      <input
        id="recipe-title"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setValue(title);
            e.currentTarget.blur();
          }
        }}
        className="w-full bg-transparent font-display text-[26px] leading-tight tracking-tight text-text-primary outline-none placeholder:text-text-secondary focus-visible:underline focus-visible:decoration-border-hairline focus-visible:underline-offset-4 disabled:opacity-60 sm:text-[30px]"
        placeholder="Recipe title"
      />
    </div>
  );
}
