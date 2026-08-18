"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, X } from "lucide-react";
import {
  cancelTimerNotification,
  ensureTimerNotificationPermission,
  formatCountdown,
  formatTimerLabel,
  isLiveCountdownTimer,
  scheduleTimerNotification,
} from "@/lib/native/cooking-timer";
import {
  getActiveTimer,
  setActiveTimer,
  subscribeActiveTimer,
  timerForStep,
} from "@/lib/native/timer-session";
import { cn } from "@/lib/utils";

type Props = {
  recipeId: string;
  recipeTitle: string;
  stepNumber: number;
  stepLabel: string;
  timerSeconds: number;
  compact?: boolean;
};

type Phase = "idle" | "running";

export function StepTimer({
  recipeId,
  recipeTitle,
  stepNumber,
  stepLabel,
  timerSeconds,
  compact = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(timerSeconds);
  const endsAtRef = useRef(0);
  const notificationIdRef = useRef<number | null>(null);
  const live = isLiveCountdownTimer(timerSeconds);

  const syncFromStore = useCallback(() => {
    const existing = timerForStep(recipeId, stepNumber);
    if (existing) {
      endsAtRef.current = existing.endsAt;
      notificationIdRef.current = existing.notificationId;
      const left = (existing.endsAt - Date.now()) / 1000;
      if (left <= 0) {
        setPhase("idle");
        setRemaining(timerSeconds);
        return;
      }
      setRemaining(left);
      setPhase("running");
      return;
    }
    endsAtRef.current = 0;
    notificationIdRef.current = null;
    setPhase("idle");
    setRemaining(timerSeconds);
  }, [recipeId, stepNumber, timerSeconds]);

  useEffect(() => {
    syncFromStore();
    return subscribeActiveTimer(syncFromStore);
  }, [syncFromStore]);

  useEffect(() => {
    if (phase !== "running" || !live) return;

    const tick = () => {
      const left = (endsAtRef.current - Date.now()) / 1000;
      setRemaining(Math.max(0, left));
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [phase, live]);

  async function start() {
    const granted = await ensureTimerNotificationPermission();
    const previous = getActiveTimer();
    if (previous?.notificationId != null) {
      void cancelTimerNotification(previous.notificationId);
    }

    const endsAt = new Date(Date.now() + timerSeconds * 1000);
    endsAtRef.current = endsAt.getTime();
    setRemaining(timerSeconds);
    setPhase("running");

    let notificationId: number | null = null;
    if (granted) {
      const body = `${recipeTitle}: ${stepLabel}. ${formatTimerLabel(timerSeconds)}`;
      notificationId = await scheduleTimerNotification({
        recipeId,
        stepNumber,
        title: "Timer done",
        body: body.slice(0, 180),
        endsAt,
      });
    }
    notificationIdRef.current = notificationId;
    setActiveTimer({
      recipeId,
      stepNumber,
      recipeTitle,
      stepLabel,
      timerSeconds,
      endsAt: endsAt.getTime(),
      notificationId,
    });
  }

  function cancel() {
    const id = notificationIdRef.current;
    notificationIdRef.current = null;
    endsAtRef.current = 0;
    setPhase("idle");
    setRemaining(timerSeconds);
    setActiveTimer(null);
    void cancelTimerNotification(id);
  }

  if (timerSeconds <= 0) return null;

  const stopBubble = {
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
  };

  if (phase === "running" && live) {
    return (
      <div
        className={cn(
          "flex items-center gap-2",
          compact ? "mt-2 h-9" : "h-14 gap-3 landscape:h-16"
        )}
        {...stopBubble}
      >
        <span
          className={cn(
            "inline-flex h-full items-center gap-2 rounded-2xl bg-accent-alert font-mono font-semibold tabular-nums leading-none text-white",
            compact
              ? "gap-1.5 px-3 text-[15px]"
              : "gap-3 px-5 text-[28px] sm:text-[32px] landscape:text-[32px]"
          )}
        >
          <Timer
            className={compact ? "h-4 w-4 shrink-0" : "h-7 w-7 shrink-0"}
            strokeWidth={2.25}
          />
          {formatCountdown(remaining)}
        </span>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel timer"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-bg-muted text-text-secondary",
            compact ? "h-9 w-9" : "h-12 w-12"
          )}
        >
          <X className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </button>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div
        className={cn(
          "flex items-center gap-2",
          compact ? "mt-2" : "h-14 landscape:h-16"
        )}
        {...stopBubble}
      >
        <p
          className={cn(
            "inline-flex h-full items-center rounded-2xl bg-accent-alert px-3 font-medium text-white",
            compact ? "text-[13px] py-1.5" : "px-5 text-[18px] landscape:text-[20px]"
          )}
        >
          Timer set for {formatTimerLabel(timerSeconds)}
        </p>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel timer"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-bg-muted text-text-secondary",
            compact ? "h-9 w-9" : "h-12 w-12"
          )}
        >
          <X className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={stopBubble.onPointerDown}
      onClick={(event) => {
        event.stopPropagation();
        void start();
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-accent-success font-semibold text-white dark:text-[#0a0a0a]",
        compact
          ? "mt-2 h-9 gap-1.5 px-3 text-[13px]"
          : "h-14 gap-2.5 px-6 text-[18px] landscape:h-16 landscape:text-[20px]"
      )}
    >
      <Timer
        className={compact ? "h-3.5 w-3.5" : "h-5 w-5 landscape:h-6 landscape:w-6"}
        strokeWidth={2.25}
      />
      Start Timer
    </button>
  );
}
