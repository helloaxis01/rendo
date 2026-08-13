"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeIncomingShare,
  takePendingShare,
  type IncomingShare,
} from "@/lib/native/incoming-share";
import { LibraryHeader } from "@/components/library/library-header";
import { SearchFilterRail } from "@/components/library/search-filter-rail";
import { RecipeGrid } from "@/components/library/recipe-grid";
import { CaptureSheet } from "@/components/capture/capture-sheet";
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
import type { LibrarySort, LibraryView, Recipe, TagRecord } from "@/lib/db/types";

export function LibraryScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<LibrarySort>("recently_added");
  const [view, setView] = useState<LibraryView>("two");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [incomingShare, setIncomingShare] = useState<IncomingShare | null>(
    null
  );
  const [ready, setReady] = useState(false);

  useAutoCloudBackup();

  async function refresh() {
    const [r, t] = await Promise.all([listRecipes(), listTags()]);
    setRecipes(r);
    setTags(t);
    setReady(true);
  }

  async function handleToggleFavorite(id: string) {
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
    })();

    const onVaultChanged = () => {
      void refresh();
    };
    window.addEventListener("rendo:vault-changed", onVaultChanged);

    const openShared = (share: IncomingShare) => {
      closeRecipeSession();
      setIncomingShare(share);
      setCaptureOpen(true);
    };
    const pendingShare = takePendingShare();
    if (pendingShare) openShared(pendingShare);
    const stopIncoming = subscribeIncomingShare(openShared);

    return () => {
      cancelled = true;
      window.removeEventListener("rendo:vault-changed", onVaultChanged);
      stopIncoming();
    };
  }, []);

  const visible = useMemo(
    () => filterRecipes(recipes, { query, filter, sort }),
    [recipes, query, filter, sort]
  );

  return (
    <div className="flex min-h-dvh w-full flex-col bg-bg-primary">
      <div className="mx-auto w-full max-w-3xl">
        <LibraryHeader onCapture={() => setCaptureOpen(true)} />
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
        />
      </div>
      {ready ? (
        <RecipeGrid
          recipes={visible}
          columns={view}
          onToggleFavorite={(id) => void handleToggleFavorite(id)}
        />
      ) : (
        <div className="px-4 py-16 text-center text-sm text-text-secondary">
          Loading vault…
        </div>
      )}
      <CaptureSheet
        open={captureOpen}
        incomingShare={incomingShare}
        onOpenChange={(next) => {
          setCaptureOpen(next);
          if (!next) setIncomingShare(null);
        }}
        onImported={() => void refresh()}
      />
    </div>
  );
}
