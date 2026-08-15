"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { CookingScreen } from "@/components/cooking/cooking-screen";
import { TimerSessionWatcher } from "@/components/cooking/timer-session-watcher";
import { LibraryScreen } from "@/components/library/library-screen";
import { NativeSwipeBack } from "@/components/native/swipe-back";
import {
  closeRecipeSession,
  followRouteSession,
  getRecipeSession,
  subscribeRecipeSession,
} from "@/lib/nav/recipe-session";
import { lockPortrait } from "@/lib/native/screen-orientation";
import { cn } from "@/lib/utils";


function recipeIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/recipe/")) return null;
  const id = pathname.slice("/recipe/".length).split("/")[0];
  return id || null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSyncExternalStore(
    subscribeRecipeSession,
    getRecipeSession,
    getRecipeSession
  );
  const pathRecipeId = recipeIdFromPath(pathname);
  const passthrough =
    pathname.startsWith("/settings") || pathname.startsWith("/auth");

  const recipeId =
    session.kind === "recipe"
      ? session.id
      : session.kind === "library"
        ? null
        : pathRecipeId;

  useEffect(() => {
    if (session.kind === "recipe" && pathRecipeId === session.id) {
      followRouteSession();
    }
    if (session.kind === "library" && !pathRecipeId && !passthrough) {
      followRouteSession();
    }
  }, [session, pathRecipeId, passthrough]);

  useEffect(() => {
    const onPop = () => followRouteSession();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    void lockPortrait();
  }, []);

  return (
    <>
      <NativeSwipeBack />
      <TimerSessionWatcher />
      {passthrough ? (
        children
      ) : (
        <>
          <div
            aria-hidden={Boolean(recipeId)}
            data-library-underlay=""
            className={cn(
              "fixed inset-0 overflow-hidden",
              recipeId && "pointer-events-none"
            )}
          >
            <LibraryScreen />
          </div>
          <RecipeOverlay recipeId={recipeId} />
        </>
      )}
    </>
  );
}

const EDGE_PX = 44;
const ACTIVATE_PX = 8;
const CLOSE_RATIO = 0.22;
const CLOSE_VELOCITY = 0.35;

function dialogBlockingSwipe() {
  return Boolean(
    document.querySelector(
      "[data-cooking-mode], [data-state='open'][role='dialog'], [aria-modal='true'][role='dialog']"
    )
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return Boolean(
    target instanceof Element &&
      target.closest(
        "a, button, input, textarea, select, label, [role='button']"
      )
  );
}

function RecipeOverlay({ recipeId }: { recipeId: string | null }) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mountedId, setMountedId] = useState(recipeId);
  const [open, setOpen] = useState(Boolean(recipeId));
  const closeTimer = useRef<number>(0);
  const closing = useRef(false);
  const drag = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    vx: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    if (recipeId) {
      closing.current = false;
      setMountedId(recipeId);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setOpen(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setOpen(false);
    closeTimer.current = window.setTimeout(() => setMountedId(null), 280);
  }, [recipeId]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !open) return;
    el.dataset.closing = "false";
    el.dataset.dragging = "false";

    function width() {
      return el?.getBoundingClientRect().width || window.innerWidth;
    }

    function setX(px: number, withTransition: boolean) {
      if (!el) return;
      el.dataset.dragging = withTransition ? "false" : "true";
      el.style.transform = `translate3d(${Math.max(0, px)}px, 0, 0)`;
    }

    function finishClose() {
      if (closing.current || !el) return;
      closing.current = true;
      el.dataset.closing = "true";
      el.dataset.dragging = "false";
      setX(width(), true);
      window.setTimeout(() => {
        closeRecipeSession();
        if (window.location.pathname.startsWith("/recipe/")) {
          router.replace("/");
        }
      }, 200);
    }

    function snapBack() {
      setX(0, true);
      window.setTimeout(() => {
        if (!el || closing.current) return;
        el.style.transform = "";
        el.dataset.dragging = "false";
      }, 260);
    }

    function onStart(x: number, y: number, target: EventTarget | null) {
      if (dialogBlockingSwipe() || closing.current) return false;
      if (isInteractiveTarget(target)) return false;
      if (x > EDGE_PX) return false;
      drag.current = {
        startX: x,
        startY: y,
        lastX: x,
        lastT: performance.now(),
        vx: 0,
        active: false,
      };
      return true;
    }

    function onMove(x: number, y: number, event: Event) {
      const state = drag.current;
      if (!state || closing.current) return;
      const dx = x - state.startX;
      const dy = y - state.startY;
      const now = performance.now();
      const dt = now - state.lastT;
      if (dt > 0) {
        state.vx = (x - state.lastX) / dt;
        state.lastX = x;
        state.lastT = now;
      }
      if (!state.active) {
        if (Math.abs(dy) > 48 && Math.abs(dy) > Math.abs(dx) * 1.35) {
          drag.current = null;
          return;
        }
        if (dx < ACTIVATE_PX) return;
        state.active = true;
      }
      event.preventDefault();
      setX(dx, false);
    }

    function onEnd(x: number) {
      const state = drag.current;
      drag.current = null;
      if (!state?.active || closing.current) return;
      const dx = Math.max(0, x - state.startX);
      if (dx > width() * CLOSE_RATIO || state.vx > CLOSE_VELOCITY) {
        finishClose();
        return;
      }
      snapBack();
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;
      if (!onStart(x, y, event.target)) return;
      if (x <= EDGE_PX && !isInteractiveTarget(event.target)) {
        event.preventDefault();
      }
    }
    function onTouchMove(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      onMove(event.touches[0].clientX, event.touches[0].clientY, event);
    }
    function onTouchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      onEnd(touch?.clientX ?? drag.current?.lastX ?? 0);
    }
    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      if (event.button !== 0) return;
      onStart(event.clientX, event.clientY, event.target);
    }
    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      onMove(event.clientX, event.clientY, event);
    }
    function onPointerUp(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      onEnd(event.clientX);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [open, router]);

  if (!mountedId) return null;

  return (
    <div
      ref={overlayRef}
      data-recipe-overlay=""
      data-open={open ? "true" : "false"}
      className="recipe-overlay fixed inset-0 z-50 overflow-y-auto overscroll-y-none bg-bg-primary touch-pan-y"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-11"
      />
      <CookingScreen recipeId={mountedId} />
    </div>
  );
}
