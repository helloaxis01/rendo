import { Capacitor, registerPlugin } from "@capacitor/core";

type LaterBrowserResult = {
  cancelled?: boolean;
  text?: string;
  url?: string;
};

type LaterBrowserPlugin = {
  open(options: { url: string }): Promise<LaterBrowserResult>;
};

const LaterBrowser = registerPlugin<LaterBrowserPlugin>("LaterBrowser");

export async function openLaterBrowser(url: string): Promise<{
  cancelled: boolean;
  text: string;
  url: string;
}> {
  const target = url.trim();
  if (!target) {
    return { cancelled: true, text: "", url: "" };
  }

  if (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("LaterBrowser")
  ) {
    const result = await LaterBrowser.open({ url: target });
    return {
      cancelled: Boolean(result.cancelled),
      text: result.text ?? "",
      url: result.url ?? target,
    };
  }

  window.open(target, "_blank", "noopener,noreferrer");
  return { cancelled: true, text: "", url: target };
}
