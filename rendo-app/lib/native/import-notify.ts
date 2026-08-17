import { Capacitor } from "@capacitor/core";

async function withNotifications<T>(
  run: (mod: typeof import("@capacitor/local-notifications")) => Promise<T>
): Promise<T | void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable("LocalNotifications")) return;
  try {
    return await run(await import("@capacitor/local-notifications"));
  } catch {
    // Permission denied or plugin missing.
  }
}

export async function notifyImportStatus(body: string, title = "RENDO") {
  await withNotifications(async ({ LocalNotifications }) => {
    const current = await LocalNotifications.checkPermissions();
    if (current.display !== "granted") {
      const next = await LocalNotifications.requestPermissions();
      if (next.display !== "granted") return;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: (Date.now() % 2147483646) + 1,
          title,
          body,
          schedule: { at: new Date(Date.now() + 400) },
        },
      ],
    });
  });
}
