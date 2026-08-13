import { Capacitor } from "@capacitor/core";

async function onNative<T>(run: () => Promise<T>): Promise<T | void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    return await run();
  } catch {
    // Web / simulator / denied haptics should never break UI.
  }
}

export async function hapticLight() {
  await onNative(async () => {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  });
}

export async function hapticMedium() {
  await onNative(async () => {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  });
}

export async function hapticSuccess() {
  await onNative(async () => {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  });
}
