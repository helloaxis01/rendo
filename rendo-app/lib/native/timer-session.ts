export type ActiveTimer = {
  recipeId: string;
  stepNumber: number;
  recipeTitle: string;
  stepLabel: string;
  timerSeconds: number;
  endsAt: number;
  notificationId: number | null;
};

let active: ActiveTimer | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getActiveTimer(): ActiveTimer | null {
  return active;
}

export function finishExpiredTimer(): ActiveTimer | null {
  if (!active || active.endsAt > Date.now()) return null;
  const finished = active;
  active = null;
  emit();
  return finished;
}

export function subscribeActiveTimer(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setActiveTimer(next: ActiveTimer | null) {
  active = next;
  emit();
}

export function timerForStep(recipeId: string, stepNumber: number) {
  const current = getActiveTimer();
  if (!current) return null;
  if (current.recipeId !== recipeId || current.stepNumber !== stepNumber) {
    return null;
  }
  return current;
}
