"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  getRecipeSession,
  subscribeRecipeSession,
} from "@/lib/nav/recipe-session";
import {
  pickHomeHeaderLine,
  writeLastOpenAt,
  writeShownMilestone,
} from "@/lib/library/home-header-line";
import type { Recipe, TagRecord } from "@/lib/db/types";

export function LibraryStatusLine({
  recipes,
  tags,
  ready,
}: {
  recipes: Recipe[];
  tags: TagRecord[];
  ready: boolean;
}) {
  const recipesRef = useRef(recipes);
  const tagsRef = useRef(tags);
  recipesRef.current = recipes;
  tagsRef.current = tags;

  const [text, setText] = useState("");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    function refreshLine() {
      if (cancelled) return;
      const pick = pickHomeHeaderLine(recipesRef.current, tagsRef.current);
      if (pick.milestone) writeShownMilestone(pick.milestone);
      writeLastOpenAt(new Date().toISOString());
      setText(pick.text);
    }

    refreshLine();

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshLine();
    };
    document.addEventListener("visibilitychange", onVisible);

    const stopSession = subscribeRecipeSession(() => {
      const session = getRecipeSession();
      if (session.kind === "library") refreshLine();
    });

    let stopApp: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        if (cancelled) return;
        void App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) refreshLine();
        }).then((handle) => {
          if (cancelled) {
            void handle.remove();
            return;
          }
          stopApp = handle;
        });
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      stopSession();
      void stopApp?.remove();
    };
  }, [ready]);

  if (!text) return null;

  return (
    <p className="mt-0.5 text-[12px] font-normal leading-snug text-text-secondary">
      {text}
    </p>
  );
}
