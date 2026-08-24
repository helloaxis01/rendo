import { Capacitor } from "@capacitor/core";
import { hapticSuccess } from "@/lib/native/haptics";

const INT32_MAX = 2147483647;

function notificationIdFor(recipeId: string, stepNumber: number) {
  const seed = `${recipeId}:${stepNumber}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % INT32_MAX || 1;
}

async function withNotifications<T>(
  run: (mod: typeof import("@capacitor/local-notifications")) => Promise<T>
): Promise<T | void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable("LocalNotifications")) return;
  try {
    return await run(await import("@capacitor/local-notifications"));
  } catch {
    // Permission denied or plugin missing — keep the in-app timer working.
  }
}

export async function ensureTimerNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const result = await withNotifications(async ({ LocalNotifications }) => {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    if (current.display === "denied") return false;
    const next = await LocalNotifications.requestPermissions();
    return next.display === "granted";
  });
  return Boolean(result);
}

export async function scheduleTimerNotification(options: {
  recipeId: string;
  stepNumber: number;
  title: string;
  body: string;
  endsAt: Date;
}): Promise<number | null> {
  const id = notificationIdFor(options.recipeId, options.stepNumber);
  if (options.endsAt.getTime() <= Date.now() + 500) return null;

  const scheduled = await withNotifications(async ({ LocalNotifications }) => {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: options.title,
          body: options.body,
          // Required on iOS — omitting sound means a silent notification.
          sound: "default",
          schedule: { at: options.endsAt, allowWhileIdle: true },
          extra: {
            recipeId: options.recipeId,
            stepNumber: options.stepNumber,
          },
        },
      ],
    });
    return true;
  });

  return scheduled ? id : null;
}

export async function cancelTimerNotification(id: number | null | undefined) {
  if (id == null) return;
  await withNotifications(async ({ LocalNotifications }) => {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  });
}

export async function onTimerFinished() {
  await hapticSuccess();
}

export function formatTimerLabel(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} min`;
  }
  return `${seconds} sec`;
}

export function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
