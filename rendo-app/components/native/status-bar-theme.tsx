"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useTheme } from "next-themes";

const LIGHT_BG = "#F6F7F8";
const DARK_BG = "#1E1E1E";

export function StatusBarTheme() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const dark = resolvedTheme === "dark";
    const background = dark ? DARK_BG : LIGHT_BG;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", background);

    if (!Capacitor.isNativePlatform()) {
      document.documentElement.style.setProperty("--rendo-clock-bar", "0px");
      return;
    }

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setBackgroundColor({ color: background });
        await StatusBar.setStyle({
          // LIGHT = dark clock on a light bar; DARK = light clock on a dark bar
          style: dark ? Style.Dark : Style.Light,
        });
        // Keep a real clock bar, like the web app — don't draw under the time.
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.show();
        const info = await StatusBar.getInfo();
        const overlayHeight =
          info.overlays && info.height > 0 ? `${info.height}px` : "0px";
        document.documentElement.style.setProperty(
          "--rendo-clock-bar",
          overlayHeight
        );
      } catch {
        document.documentElement.style.setProperty("--rendo-clock-bar", "0px");
      }
    })();
  }, [resolvedTheme]);

  return null;
}
