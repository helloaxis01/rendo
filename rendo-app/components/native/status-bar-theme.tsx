"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useTheme } from "@/lib/theme/theme-provider";

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

    let cancelled = false;
    const timers: number[] = [];

    async function apply() {
      if (cancelled) return;
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setBackgroundColor({ color: background });
        // Capacitor: Dark = white icons (dark bg); Light = black icons (light bg).
        await StatusBar.setStyle({
          style: dark ? Style.Dark : Style.Light,
        });
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
    }

    void apply();
    // Native config reapplies LIGHT on view-appear and can overwrite the theme.
    timers.push(window.setTimeout(() => void apply(), 80));
    timers.push(window.setTimeout(() => void apply(), 400));

    const onResume = () => {
      void apply();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    let removeAppListener: (() => void) | undefined;
    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void apply();
        })
      )
      .then((handle) => {
        if (handle && "remove" in handle) {
          removeAppListener = () => {
            void handle.remove();
          };
        }
      })
      .catch(() => {
        // App plugin missing
      });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      removeAppListener?.();
    };
  }, [resolvedTheme]);

  return null;
}
