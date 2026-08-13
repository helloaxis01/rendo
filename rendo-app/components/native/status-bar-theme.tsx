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

    if (!Capacitor.isNativePlatform()) return;

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Draw the page under the clock so there is no native seam/black line.
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({
          // LIGHT = dark clock on a light bar; DARK = light clock on a dark bar
          style: dark ? Style.Dark : Style.Light,
        });
      } catch {
        // Plugin missing in some shells; page theme still applies.
      }
    })();
  }, [resolvedTheme]);

  return null;
}
