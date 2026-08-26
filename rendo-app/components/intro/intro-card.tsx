"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium } from "@/lib/native/haptics";

type Props = {
  open: boolean;
  onStart: () => void;
  onSkip: () => void;
};

/** Welcome card shown before the onboarding tour. Waits for the user to begin. */
export function IntroCard({ open, onStart, onSkip }: Props) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setEntered(true);
    window.dispatchEvent(new CustomEvent("rendo:splash-ready"));
  }, [open]);

  if (!open) return null;

  function handleStart() {
    void hapticMedium();
    onStart();
  }

  function handleSkip() {
    void hapticLight();
    onSkip();
  }

  return (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
    >
      <div className="rendo-type-cover relative flex h-full w-full flex-col overflow-hidden">
        <button
          type="button"
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 px-2 py-2 text-[13px] text-text-secondary"
          onClick={handleSkip}
        >
          Skip
        </button>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div
            className={cn(
              "rendo-intro-breathe flex flex-col items-center text-center transition-opacity duration-700 ease-out",
              entered ? "opacity-100" : "opacity-0"
            )}
          >
            <p
              id="intro-title"
              className="font-display text-[clamp(2.25rem,9.8vw,3.15rem)] font-bold leading-none tracking-tight"
            >
              RENDO
            </p>
            <p className="mt-4 font-display text-[15px] font-normal leading-snug tracking-tight text-text-secondary">
              Modern Recipe Vault
            </p>
            <p className="mt-11 whitespace-nowrap text-[15px] leading-snug text-text-primary">
              Screenshot it. Cook it. Keep it.
            </p>
            <button
              type="button"
              onClick={handleStart}
              className="mt-10 flex h-12 w-full min-w-[min(100%,20rem)] items-center justify-center rounded-full bg-text-primary px-8 text-[15px] font-semibold text-bg-primary"
            >
              Let&apos;s cook!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
