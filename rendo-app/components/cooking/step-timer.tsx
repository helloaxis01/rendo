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
    setPhase("idle");
    setRemaining(timerSeconds);
    endsAtRef.current = 0;
    const id = notificationIdRef.current;
    notificationIdRef.current = null;
    if (id != null) void cancelTimerNotification(id);
  }, [recipeId, stepNumber, timerSeconds]);

  useEffect(() => {
    if (phase !== "running") return;

    const tick = () => {
      const left = (endsAtRef.current - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setPhase("done");
        const id = notificationIdRef.current;
        notificationIdRef.current = null;
        void cancelTimerNotification(id);
        void onTimerFinished();
        return;
      }
      setRemaining(left);
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    return () => {
      const id = notificationIdRef.current;
      if (id != null) void cancelTimerNotification(id);
    };
  }, []);

  async function start() {
    const granted = await ensureTimerNotificationPermission();
    const endsAt = new Date(Date.now() + timerSeconds * 1000);
    endsAtRef.current = endsAt.getTime();
    setRemaining(timerSeconds);
    setPhase("running");

    if (granted) {
      const body = `${recipeTitle}: ${stepLabel} — ${formatTimerLabel(timerSeconds)}`;
      notificationIdRef.current = await scheduleTimerNotification({
        recipeId,
        stepNumber,
        title: "Timer done",
        body: body.slice(0, 180),
        endsAt,
      });
    }
  }

  function cancel() {
    const id = notificationIdRef.current;
    notificationIdRef.current = null;
    endsAtRef.current = 0;
    setPhase("idle");
    setRemaining(timerSeconds);
    void cancelTimerNotification(id);
  }

  if (timerSeconds <= 0) return null;

  if (phase === "done") {
    return (
      <p className="mt-4 text-[13px] font-medium text-accent-success">
        Timer done
      </p>
    );
  }

  if (phase === "running") {
    return (
      <div className="mt-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-3.5 py-2 font-mono text-[13px] font-semibold tabular-nums text-bg-primary">
          <Timer className="h-3.5 w-3.5" />
          {formatCountdown(remaining)}
        </span>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel timer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg-muted text-text-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void start();
      }}
      className={cn(
        "mt-4 inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-3.5 py-2 text-[13px] font-medium text-text-primary"
      )}
    >
      <Timer className="h-3.5 w-3.5" />
      Start {formatTimerLabel(timerSeconds)} timer
    </button>
  );
}
