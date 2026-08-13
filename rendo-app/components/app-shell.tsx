"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CookingScreen } from "@/components/cooking/cooking-screen";
import { LibraryScreen } from "@/components/library/library-screen";
import { NativeSwipeBack } from "@/components/native/swipe-back";
import {
  followRouteSession,
  getRecipeSession,
  subscribeRecipeSession,
} from "@/lib/nav/recipe-session";

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
      {passthrough ? (
        children
      ) : (
        <>
          <div hidden={Boolean(recipeId)}>
            <LibraryScreen />
          </div>
          {recipeId ? <CookingScreen recipeId={recipeId} /> : null}
        </>
      )}
    </>
  );
}
