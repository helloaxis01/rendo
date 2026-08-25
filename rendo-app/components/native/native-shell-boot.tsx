"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { startNativeKeyboard } from "@/lib/native/keyboard";

/** Boot native Keyboard; hide Capacitor splash once the intro card has painted. */
export function NativeShellBoot() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const stopKeyboard = startNativeKeyboard();

    let hidden = false;
    async function hideNativeSplash() {
      if (hidden) return;
      hidden = true;
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide({ fadeOutDuration: 220 });
      } catch {
        // SplashScreen plugin optional until cap:sync
      }
    }

    const onIntroReady = () => void hideNativeSplash();
    window.addEventListener("rendo:splash-ready", onIntroReady);
    // No intro on settings/auth routes — hide native splash after a short wait.
    const fallback = window.setTimeout(() => void hideNativeSplash(), 3200);

    return () => {
      window.removeEventListener("rendo:splash-ready", onIntroReady);
      window.clearTimeout(fallback);
      stopKeyboard();
    };
  }, []);

  return null;
}
