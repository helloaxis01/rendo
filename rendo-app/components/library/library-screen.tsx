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
import type { LibrarySort, Recipe, TagRecord } from "@/lib/db/types";

export function LibraryScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
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
    <div className="min-h-dvh w-full bg-bg-primary">
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
        />
      </div>
      {ready ? (
        <RecipeGrid
          recipes={visible}
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
