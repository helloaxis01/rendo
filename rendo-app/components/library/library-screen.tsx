"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  subscribeIncomingShare,
  takePendingShare,
  type IncomingShare,
} from "@/lib/native/incoming-share";
import { mergeIncomingShares } from "@/lib/extract/instagram";
import { LibraryHeader } from "@/components/library/library-header";
import { SearchFilterRail } from "@/components/library/search-filter-rail";
import { RecipeGrid } from "@/components/library/recipe-grid";
import { KitchenSheet } from "@/components/library/kitchen-filter";
import { CaptureSheet } from "@/components/capture/capture-sheet";
import {
  OnboardingFlow,
  type OnboardingFinishReason,
} from "@/components/onboarding/onboarding-flow";
import { IntroCard } from "@/components/intro/intro-card";
import { closeRecipeSession } from "@/lib/nav/recipe-session";
import {
  filterRecipes,
  getPreferences,
  listRecipes,
  listTags,
  setPreferences,
  toggleFavorite,
} from "@/lib/db/queries";
import { useAutoCloudBackup } from "@/lib/db/sync";
import { backfillPhotolessSubtitles } from "@/lib/extract/backfill-subtitles";
import { backfillIngredientSections } from "@/lib/extract/backfill-ingredient-sections";
import { hapticLight, hapticSuccess } from "@/lib/native/haptics";
import { rankRecipesByKitchen } from "@/lib/library/kitchen";
import type {
  LibrarySort,
  LibraryView,
  Recipe,
  TagRecord,
} from "@/lib/db/types";

export function LibraryScreen() {
  const searchParams = useSearchParams();
  const forceOnboarding = searchParams.get("onboarding") === "1";
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<LibrarySort>("recently_added");
  const [view, setView] = useState<LibraryView>("two");
  const [kitchenSheetOpen, setKitchenSheetOpen] = useState(false);
  const [kitchenIngredients, setKitchenIngredients] = useState<string[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureInitialView, setCaptureInitialView] = useState<
    "menu" | "photo"
  >("menu");
  const [incomingShare, setIncomingShare] = useState<IncomingShare | null>(
    null
  );
  const [sessionToast, setSessionToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const dismissSessionToast = useCallback(() => setSessionToast(null), []);

  useAutoCloudBackup();

  async function refresh() {
    const [r, t] = await Promise.all([listRecipes(), listTags()]);
    setRecipes(r);
    setTags(t);
    setReady(true);
  }

  async function handleToggleFavorite(id: string) {
    void hapticLight();
    setRecipes((prev) =>
      prev.map((recipe) =>
        recipe.id === id
          ? { ...recipe, is_favorite: !recipe.is_favorite }
          : recipe
      )
    );
    try {
      await toggleFavorite(id);
    } catch {
      await refresh();
    }
  }

  async function handleSortChange(next: LibrarySort) {
    setSort(next);
    await setPreferences({ library_sort: next });
  }

  async function handleViewChange(next: LibraryView) {
    setView(next);
    await setPreferences({ library_view: next });
  }

  async function completeOnboarding(reason: OnboardingFinishReason) {
    setIntroOpen(false);
    setOnboardingOpen(false);
    await setPreferences({ onboarding_completed: true });
    // Skip and final CTA both open Add Recipe — goal is first import, not empty home.
    if (reason === "capture" || reason === "skip") {
      // Menu only — do not open photo picker (would request library permission).
      setCaptureInitialView("menu");
      setCaptureOpen(true);
    }
  }

  function startOnboarding() {
    setIntroOpen(false);
    setOnboardingOpen(true);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [r, t, prefs] = await Promise.all([
        listRecipes(),
        listTags(),
        getPreferences(),
      ]);
      if (cancelled) return;
      setRecipes(r);
      setTags(t);
      setSort(prefs.library_sort ?? "recently_added");
      setView(prefs.library_view ?? "two");
      setReady(true);

      const pendingShare = takePendingShare();
      if (pendingShare) {
        if (!prefs.onboarding_completed) {
          await setPreferences({ onboarding_completed: true });
        }
        closeRecipeSession();
        if (pendingShare.images?.length) {
          const count = pendingShare.images.length;
          void hapticSuccess();
          setSessionToast(
            count === 1 ? "Photo added to session" : "Photos added to session"
          );
        }
        setIncomingShare(pendingShare);
        setCaptureInitialView("menu");
        setCaptureOpen(true);
      } else if (forceOnboarding || !prefs.onboarding_completed) {
        setIntroOpen(true);
      } else {
        window.dispatchEvent(new CustomEvent("rendo:splash-ready"));
      }

      const filled = await backfillPhotolessSubtitles();
      const sectioned = await backfillIngredientSections();
      if (!cancelled && filled + sectioned > 0) await refresh();
    })();

    const onVaultChanged = () => {
      void refresh();
    };
    window.addEventListener("rendo:vault-changed", onVaultChanged);

    const openShared = (share: IncomingShare) => {
      closeRecipeSession();
      if (share.images?.length) {
        const count = share.images.length;
        void hapticSuccess();
        setSessionToast(
          count === 1 ? "Photo added to session" : "Photos added to session"
        );
      }
      setIntroOpen(false);
      setOnboardingOpen(false);
      setIncomingShare((prev) => mergeIncomingShares(prev, share));
      setCaptureInitialView("menu");
      setCaptureOpen(true);
    };
    const stopIncoming = subscribeIncomingShare(openShared);

    return () => {
      cancelled = true;
      window.removeEventListener("rendo:vault-changed", onVaultChanged);
      stopIncoming();
    };
  }, [forceOnboarding]);

  const visible = useMemo(() => {
    const filtered = filterRecipes(recipes, { query, filter, sort });
    if (kitchenIngredients.length === 0) return filtered;
    return rankRecipesByKitchen(filtered, kitchenIngredients);
  }, [recipes, query, filter, sort, kitchenIngredients]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-primary">
      <div className="mx-auto w-full max-w-3xl shrink-0 bg-bg-primary">
        <LibraryHeader
          onCapture={() => {
            setCaptureInitialView("menu");
            setCaptureOpen(true);
          }}
        />
        <SearchFilterRail
          query={query}
          onQueryChange={setQuery}
          activeFilter={filter}
          onFilterChange={setFilter}
          tags={tags}
          sort={sort}
          onSortChange={(s) => void handleSortChange(s)}
          view={view}
          onViewChange={(v) => void handleViewChange(v)}
          kitchenSheetOpen={kitchenSheetOpen}
          kitchenCount={kitchenIngredients.length}
          onKitchenOpen={() => setKitchenSheetOpen(true)}
          onKitchenClear={() => setKitchenIngredients([])}
        />
      </div>
      {ready ? (
        <div className="library-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-3xl">
            <RecipeGrid
              recipes={visible}
              columns={view}
              kitchenSelected={kitchenIngredients}
              onToggleFavorite={(id) => void handleToggleFavorite(id)}
            />
          </div>
        </div>
      ) : (
        <div className="px-4 py-16 text-center text-sm text-text-secondary">
          Loading vault…
        </div>
      )}
      <KitchenSheet
        open={kitchenSheetOpen}
        onOpenChange={setKitchenSheetOpen}
        recipes={recipes}
        applied={kitchenIngredients}
        onApply={setKitchenIngredients}
      />
      <CaptureSheet
        open={captureOpen}
        initialView={captureInitialView}
        incomingShare={incomingShare}
        onOpenChange={(next) => {
          setCaptureOpen(next);
          if (!next) {
            setIncomingShare(null);
            setCaptureInitialView("menu");
          }
        }}
        onImported={() => {
          void (async () => {
            await backfillPhotolessSubtitles();
            await refresh();
          })();
        }}
      />
      <IntroCard
        open={introOpen}
        onStart={startOnboarding}
        onSkip={() => void completeOnboarding("skip")}
      />
      <OnboardingFlow
        open={onboardingOpen}
        onFinish={(reason) => void completeOnboarding(reason)}
      />
      <SessionToast message={sessionToast} onDone={dismissSessionToast} />
    </div>
  );
}

function SessionToast({
  message,
  onDone,
}: {
  message: string | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-6">
      <div className="rounded-full bg-text-primary px-4 py-2 text-[13px] font-medium text-bg-primary shadow-lg">
        {message}
      </div>
    </div>
  );
}
