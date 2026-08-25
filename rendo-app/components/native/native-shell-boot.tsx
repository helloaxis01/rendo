"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { startNativeKeyboard } from "@/lib/native/keyboard";

/** Boot native Keyboard + SplashScreen once the webview is interactive. */
export function NativeShellBoot() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const stopKeyboard = startNativeKeyboard();

    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        // SplashScreen plugin optional until cap:sync
      }
    })();

    return () => {
      stopKeyboard();
    };
  }, []);

  return null;
}
