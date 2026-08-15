import { Capacitor } from "@capacitor/core";

async function onNative(run: () => Promise<void>) {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await run();
    return true;
  } catch {
    return false;
  }
}

type WebOrientation = {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

export async function lockPortrait() {
  const locked = await onNative(async () => {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "portrait" });
  });
  if (locked) return;
  try {
    const orientation = screen.orientation as WebOrientation | undefined;
    await orientation?.lock?.("portrait");
  } catch {
    // Desktop browsers often reject orientation lock.
  }
}

export async function unlockOrientation() {
  const unlocked = await onNative(async () => {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.unlock();
  });
  if (unlocked) return;
  try {
    const orientation = screen.orientation as WebOrientation | undefined;
    orientation?.unlock?.();
  } catch {
    // Ignore when the platform does not allow unlock.
  }
}
