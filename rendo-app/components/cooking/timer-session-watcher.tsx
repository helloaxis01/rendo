"use client";

import { useEffect } from "react";
import {
  cancelTimerNotification,
  onTimerFinished,
} from "@/lib/native/cooking-timer";
import { finishExpiredTimer } from "@/lib/native/timer-session";

/** Keeps a running cooking timer alive after leaving the step (or cooking mode). */
export function TimerSessionWatcher() {
  useEffect(() => {
    const tick = () => {
      const finished = finishExpiredTimer();
      if (!finished) return;
      void cancelTimerNotification(finished.notificationId);
      void onTimerFinished();
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
