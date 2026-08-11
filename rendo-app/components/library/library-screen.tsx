"use client";

import { useEffect, useMemo, useState } from "react";
import { LibraryHeader } from "@/components/library/library-header";
import { SearchFilterRail } from "@/components/library/search-filter-rail";
import { RecipeGrid } from "@/components/library/recipe-grid";
import { CaptureSheet } from "@/components/capture/capture-sheet";
import {
  filterRecipes,
  getPreferences,
  listRecipes,
  listTags,
  setPreferences,
  toggleFavorite,
} from "@/lib/db/queries";
import { useSyncOnReconnect } from "@/lib/db/sync";
import type {
  LibrarySort,
  LibraryView,
  Recipe,
  TagRecord,
} from "@/lib/db/types";

export function LibraryScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView>("tiles");
  const [sort, setSort] = useState<LibrarySort>("recently_added");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useSyncOnReconnect();

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

  async function handleViewChange(next: LibraryView) {
    setView(next);
    await setPreferences({ library_view: next });
  }

  async function handleSortChange(next: LibrarySort) {
    setSort(next);
    await setPreferences({ library_sort: next });
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
      setView(prefs.library_view ?? "tiles");
      setSort(prefs.library_sort ?? "recently_added");
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => filterRecipes(recipes, { query, filter, sort }),
    [recipes, query, filter, sort]
  );

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary">
      <LibraryHeader onCapture={() => setCaptureOpen(true)} />
      <SearchFilterRail
        query={query}
        onQueryChange={setQuery}
        activeFilter={filter}
        onFilterChange={setFilter}
        tags={tags}
        view={view}
        onViewChange={(v) => void handleViewChange(v)}
        sort={sort}
        onSortChange={(s) => void handleSortChange(s)}
      />
      {ready ? (
        <RecipeGrid
          recipes={visible}
          view={view}
          onToggleFavorite={(id) => void handleToggleFavorite(id)}
        />
      ) : (
        <div className="px-4 py-16 text-center text-sm text-text-secondary">
          Loading vault…
        </div>
      )}
      <CaptureSheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onImported={() => void refresh()}
      />
    </div>
  );
}
