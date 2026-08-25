"use client";

import { Capacitor } from "@capacitor/core";

let started = false;

/**
 * Wire Capacitor Keyboard so focused inputs stay visible and dismiss
 * matches iOS form behavior (scroll / tap outside).
 */
export function startNativeKeyboard(): () => void {
  if (started || typeof window === "undefined") return () => {};
  if (!Capacitor.isNativePlatform()) return () => {};
  started = true;

  let removeShow: (() => void) | undefined;
  let removeHide: (() => void) | undefined;
  let cancelled = false;

  void (async () => {
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
      await Keyboard.setScroll({ isDisabled: false });

      const showHandle = await Keyboard.addListener("keyboardWillShow", (info) => {
        document.documentElement.style.setProperty(
          "--rendo-keyboard-height",
          `${info.keyboardHeight}px`
        );
        document.documentElement.dataset.keyboard = "open";
      });
      const hideHandle = await Keyboard.addListener("keyboardWillHide", () => {
        document.documentElement.style.setProperty("--rendo-keyboard-height", "0px");
        delete document.documentElement.dataset.keyboard;
      });

      if (cancelled) {
        void showHandle.remove();
        void hideHandle.remove();
        return;
      }
      removeShow = () => {
        void showHandle.remove();
      };
      removeHide = () => {
        void hideHandle.remove();
      };
    } catch {
      started = false;
    }
  })();

  const dismissOnScroll = () => {
    if (document.documentElement.dataset.keyboard !== "open") return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) {
      active.blur();
    }
    void import("@capacitor/keyboard")
      .then(({ Keyboard }) => Keyboard.hide())
      .catch(() => {});
  };

  window.addEventListener("touchmove", dismissOnScroll, { passive: true });

  return () => {
    cancelled = true;
    started = false;
    window.removeEventListener("touchmove", dismissOnScroll);
    removeShow?.();
    removeHide?.();
    document.documentElement.style.removeProperty("--rendo-keyboard-height");
    delete document.documentElement.dataset.keyboard;
  };
}

export async function hideNativeKeyboard() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch {
    // ignore
  }
}
