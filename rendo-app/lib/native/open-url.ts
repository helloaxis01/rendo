import { Capacitor } from "@capacitor/core";

export async function openExternalUrl(url: string): Promise<void> {
  const target = url.trim();
  if (!target) return;

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Browser")) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: target });
    return;
  }

  window.open(target, "_blank", "noopener,noreferrer");
}
