"use client";

import { useEffect, useState } from "react";
import {
  cancelTimerNotification,
  formatTimerLabel,
  onTimerFinished,
} from "@/lib/native/cooking-timer";
import { finishExpiredTimer } from "@/lib/native/timer-session";

type Alert = {
  title: string;
  detail: string;
};

function playTimerChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    void ctx.resume();
  } catch {
    // Autoplay may be blocked; haptic + banner still fire.
  }
}

/** Keeps a cooking timer alive after leaving the step, and alerts in-app when it ends. */
export function TimerSessionWatcher() {
  const [alert, setAlert] = useState<Alert | null>(null);

  useEffect(() => {
    const tick = () => {
      const finished = finishExpiredTimer();
      if (!finished) return;
      void cancelTimerNotification(finished.notificationId);
      void onTimerFinished();
      playTimerChime();
      setAlert({
        title: "Timer done",
        detail: `${finished.recipeTitle} · ${formatTimerLabel(finished.timerSeconds)}`,
      });
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!alert) return;
    const id = window.setTimeout(() => setAlert(null), 5000);
    return () => window.clearTimeout(id);
  }, [alert]);

  if (!alert) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[200] flex justify-center px-4"
    >
      <div className="rounded-2xl bg-text-primary px-5 py-3 text-center text-bg-primary shadow-lg">
        <p className="text-[15px] font-semibold">{alert.title}</p>
        <p className="mt-0.5 text-[13px] opacity-80">{alert.detail}</p>
      </div>
    </div>
  );
}
