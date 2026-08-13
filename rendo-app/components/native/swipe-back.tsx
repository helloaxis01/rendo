"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

const EDGE_PX = 32;
const SWIPE_PX = 56;
const MAX_OFF_AXIS_PX = 48;

function dialogOpen() {
  return Boolean(
    document.querySelector(
      '[data-state="open"][role="dialog"], [aria-modal="true"][role="dialog"]'
    )
  );
}

function recipeOverlayOpen() {
  return Boolean(document.querySelector("[data-recipe-overlay]"));
}

export function NativeSwipeBack() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const goBack = () => {
      if (dialogOpen() || recipeOverlayOpen()) return;
      const path = pathnameRef.current;
      if (path.startsWith("/settings") || path.startsWith("/auth")) {
        router.back();
      }
    };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      if (touch.clientX > EDGE_PX) {
        tracking = false;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dy) > MAX_OFF_AXIS_PX && Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
        return;
      }
      if (dx > SWIPE_PX && Math.abs(dy) < MAX_OFF_AXIS_PX) {
        tracking = false;
        goBack();
      }
    };

    const onEnd = () => {
      tracking = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  return null;
}
