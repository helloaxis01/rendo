"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  onSave: (title: string) => Promise<void>;
};

export function RecipeTitleEditor({ title, onSave }: Props) {
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(title);
  }, [title]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, el.scrollHeight);
    // Cap at ~3 lines of the current computed line-height
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 32;
    const maxHeight = Math.ceil(lineHeight * 3);
    el.style.height = `${Math.min(next, maxHeight)}px`;
  }, [value]);

  async function commit() {
    const next = value.replace(/\s+/g, " ").trim();
    if (!next) {
      setValue(title);
      return;
    }
    if (next === title) {
      setValue(next);
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
    <div className="px-4 pt-5">
      <label className="sr-only" htmlFor="recipe-title">
        Recipe title
      </label>
      <textarea
        id="recipe-title"
        ref={ref}
        rows={1}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setValue(title);
            e.currentTarget.blur();
          }
        }}
        className="block w-full resize-none overflow-hidden bg-transparent font-display text-[26px] leading-[1.15] tracking-tight text-text-primary outline-none placeholder:text-text-secondary focus-visible:underline focus-visible:decoration-border-hairline focus-visible:underline-offset-4 disabled:opacity-60 sm:text-[30px]"
        placeholder="Recipe title"
      />
    </div>
  );
}
