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
            className={cn(
              "fixed inset-0 overflow-y-auto overscroll-y-none",
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

const EDGE_PX = 28;
const CLOSE_RATIO = 0.28;
const CLOSE_VELOCITY = 0.55;

function RecipeOverlay({ recipeId }: { recipeId: string | null }) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mountedId, setMountedId] = useState(recipeId);
  const [open, setOpen] = useState(Boolean(recipeId));
  const closeTimer = useRef<number>(0);
  const drag = useRef<{
    id: number;
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
      setMountedId(recipeId);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setOpen(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setOpen(false);
    closeTimer.current = window.setTimeout(() => setMountedId(null), 240);
  }, [recipeId]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !open) return;

    function dialogOpen() {
      return Boolean(
        document.querySelector(
          '[data-cooking-mode], [data-state="open"][role="dialog"], [aria-modal="true"][role="dialog"]'
        )
      );
    }

    function setX(px: number, withTransition: boolean) {
      if (!el) return;
      el.dataset.dragging = withTransition ? "false" : "true";
      el.style.transform = `translate3d(${Math.max(0, px)}px, 0, 0)`;
    }

    function finishClose() {
      const width = el?.getBoundingClientRect().width ?? window.innerWidth;
      setX(width, true);
      closeRecipeSession();
      if (window.location.pathname.startsWith("/recipe/")) {
        router.back();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (dialogOpen()) return;
      if (event.clientX > EDGE_PX) return;
      drag.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastT: event.timeStamp,
        vx: 0,
        active: false,
      };
      el?.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      const state = drag.current;
      if (!state || state.id !== event.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const dt = event.timeStamp - state.lastT;
      if (dt > 0) {
        state.vx = (event.clientX - state.lastX) / dt;
        state.lastX = event.clientX;
        state.lastT = event.timeStamp;
      }
      if (!state.active) {
        if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) {
          drag.current = null;
          return;
        }
        if (dx < 10) return;
        state.active = true;
      }
      event.preventDefault();
      setX(dx, false);
    }

    function onPointerUp(event: PointerEvent) {
      const state = drag.current;
      if (!state || state.id !== event.pointerId) return;
      drag.current = null;
      if (!state.active) return;
      const width = el?.getBoundingClientRect().width ?? window.innerWidth;
      const dx = Math.max(0, event.clientX - state.startX);
      if (dx > width * CLOSE_RATIO || state.vx > CLOSE_VELOCITY) {
        finishClose();
        return;
      }
      setX(0, true);
      window.setTimeout(() => {
        if (!el) return;
        el.style.transform = "";
        el.dataset.dragging = "false";
      }, 240);
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
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
      className="recipe-overlay fixed inset-0 z-50 overflow-y-auto overscroll-y-none bg-bg-primary"
    >
      <CookingScreen recipeId={mountedId} />
    </div>
  );
}
