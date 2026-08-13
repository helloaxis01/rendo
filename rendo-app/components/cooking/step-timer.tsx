"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, X } from "lucide-react";
import {
  cancelTimerNotification,
  ensureTimerNotificationPermission,
  formatCountdown,
  formatTimerLabel,
  onTimerFinished,
  scheduleTimerNotification,
} from "@/lib/native/cooking-timer";
import {
  finishExpiredTimer,
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
};

type Phase = "idle" | "running" | "done";

export function StepTimer({
  recipeId,
  recipeTitle,
  stepNumber,
  stepLabel,
  timerSeconds,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(timerSeconds);
  const endsAtRef = useRef(0);
  const notificationIdRef = useRef<number | null>(null);

  useEffect(() => {
    const existing = timerForStep(recipeId, stepNumber);
    if (existing) {
      endsAtRef.current = existing.endsAt;
      notificationIdRef.current = existing.notificationId;
      const left = (existing.endsAt - Date.now()) / 1000;
      if (left <= 0) {
        setPhase("done");
        setRemaining(0);
        return;
      }
      setRemaining(left);
      setPhase("running");
      return;
    }
    setPhase("idle");
    setRemaining(timerSeconds);
    endsAtRef.current = 0;
    notificationIdRef.current = null;
  }, [recipeId, stepNumber, timerSeconds]);

  useEffect(() => {
    return subscribeActiveTimer(() => {
      if (timerForStep(recipeId, stepNumber)) return;
      if (endsAtRef.current > 0 && endsAtRef.current <= Date.now()) {
        setPhase("done");
        setRemaining(0);
        notificationIdRef.current = null;
      }
    });
  }, [recipeId, stepNumber]);

  useEffect(() => {
    if (phase !== "running") return;

    const tick = () => {
      const left = (endsAtRef.current - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setPhase("done");
        notificationIdRef.current = null;
        const finished = finishExpiredTimer();
        if (finished) {
          void cancelTimerNotification(finished.notificationId);
          void onTimerFinished();
        }
        return;
      }
      setRemaining(left);
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [phase]);

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
      const body = `${recipeTitle}: ${stepLabel} — ${formatTimerLabel(timerSeconds)}`;
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

  if (phase === "done") {
    return (
      <p className="flex h-14 items-center text-[22px] font-semibold text-accent-success landscape:h-16">
        Timer done
      </p>
    );
  }

  if (phase === "running") {
    return (
      <div
        className="flex h-14 items-center gap-3 landscape:h-16"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="inline-flex h-full items-center gap-3 rounded-2xl bg-text-primary px-5 font-mono text-[28px] font-semibold tabular-nums leading-none text-bg-primary sm:text-[32px] landscape:text-[32px]">
          <Timer className="h-7 w-7 shrink-0" strokeWidth={2.25} />
          {formatCountdown(remaining)}
        </span>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel timer"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg-muted text-text-secondary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void start();
      }}
      className={cn(
        "inline-flex h-14 items-center gap-2.5 rounded-full bg-bg-muted px-6 text-[18px] font-semibold text-text-primary landscape:h-16 landscape:text-[20px]"
      )}
    >
      <Timer className="h-5 w-5 landscape:h-6 landscape:w-6" strokeWidth={2.25} />
      Start {formatTimerLabel(timerSeconds)} timer
    </button>
  );
}
