import { Capacitor, registerPlugin } from "@capacitor/core";

export type LaterBrowserAction = "paste" | "screenshots" | "";

type LaterBrowserResult = {
  cancelled?: boolean;
  action?: LaterBrowserAction;
  text?: string;
  url?: string;
};

type LaterBrowserPlugin = {
  open(options: { url: string }): Promise<LaterBrowserResult>;
};

const LaterBrowser = registerPlugin<LaterBrowserPlugin>("LaterBrowser");

export async function openLaterBrowser(url: string): Promise<{
  cancelled: boolean;
  action: LaterBrowserAction;
  text: string;
  url: string;
}> {
  const target = url.trim();
  if (!target) {
    return { cancelled: true, action: "", text: "", url: "" };
  }

  if (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("LaterBrowser")
  ) {
    const result = await LaterBrowser.open({ url: target });
    const action =
      result.action === "paste" || result.action === "screenshots"
        ? result.action
        : "";
    return {
      cancelled: Boolean(result.cancelled) && !action,
      action,
      text: result.text ?? "",
      url: result.url ?? target,
    };
  }

  window.open(target, "_blank", "noopener,noreferrer");
  return { cancelled: true, action: "", text: "", url: target };
}
