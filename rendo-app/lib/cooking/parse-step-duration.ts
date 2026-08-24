/**
 * Parse a reliable cook duration from step text.
 * Returns null when no clear minutes/hours/seconds phrase is present —
 * never invents a timer from bare numbers (e.g. "2 cloves", "350°F").
 */

const UNIT =
  "(?:hours?|hrs?|hr|minutes?|mins?|min\\.?|seconds?|secs?|sec\\.?)";

/** "10-12 minutes", "10 to 12 min", "for 8 minutes", "1.5 hours" */
const DURATION_RE = new RegExp(
  String.raw`(?:(?:for|about|around|approximately|approx\.?|another|at\s+least)\s+)?(\d+(?:\.\d+)?)\s*(?:(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*)?(${UNIT})\b`,
  "gi"
);

/** "1 hour 15 minutes" / "2 hr 30 min" */
const COMPOUND_RE = new RegExp(
  String.raw`(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr)\s+(?:and\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|min\.?)\b`,
  "gi"
);

function unitToSeconds(amount: number, unit: string): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const u = unit.toLowerCase().replace(/\./g, "");
  if (/^hours?|^hrs?|^hr$/.test(u)) return Math.round(amount * 3600);
  if (/^minutes?|^mins?|^min$/.test(u)) return Math.round(amount * 60);
  if (/^seconds?|^secs?|^sec$/.test(u)) return Math.round(amount);
  return null;
}

const MAX_SECONDS = 24 * 60 * 60; // overnight brines stay notification-only
const MIN_SECONDS = 5;

export function parseStepDurationSeconds(text: string): number | null {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  let best: number | null = null;

  for (const match of raw.matchAll(COMPOUND_RE)) {
    const hours = Number(match[1]);
    const minutes = Number(match[3]);
    const total = unitToSeconds(hours, "hour") ?? 0;
    const mins = unitToSeconds(minutes, "minute") ?? 0;
    const seconds = total + mins;
    if (seconds >= MIN_SECONDS && seconds <= MAX_SECONDS) {
      best = best == null ? seconds : Math.max(best, seconds);
    }
  }

  for (const match of raw.matchAll(DURATION_RE)) {
    const a = Number(match[1]);
    const b = match[2] ? Number(match[2]) : null;
    const unit = match[3];
    // Ranges like "10-12 minutes" → use the upper bound (finish the wait).
    const amount = b != null && Number.isFinite(b) ? Math.max(a, b) : a;
    const seconds = unitToSeconds(amount, unit);
    if (seconds == null) continue;
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) continue;
    best = best == null ? seconds : Math.max(best, seconds);
  }

  return best;
}

/** Prefer extract-provided timer_seconds; otherwise parse the instruction. */
export function resolveStepTimerSeconds(step: {
  timer_seconds?: number | null;
  instruction: string;
}): number | null {
  const stored = step.timer_seconds;
  if (
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored >= MIN_SECONDS
  ) {
    return Math.min(MAX_SECONDS, Math.round(stored));
  }
  return parseStepDurationSeconds(step.instruction);
}
