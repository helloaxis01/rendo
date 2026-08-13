import { Capacitor } from "@capacitor/core";

export async function sharePlainText(options: {
  title: string;
  text: string;
}): Promise<"shared" | "copied"> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Share")) {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: options.title,
      text: options.text,
      dialogTitle: options.title,
    });
    return "shared";
  }

  if (typeof navigator.share === "function") {
    await navigator.share({
      title: options.title,
      text: options.text,
    });
    return "shared";
  }

  await navigator.clipboard.writeText(options.text);
  return "copied";
}
