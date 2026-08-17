"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeIncomingShare,
  takePendingShare,
  type IncomingShare,
} from "@/lib/native/incoming-share";
import { mergeIncomingShares } from "@/lib/extract/instagram";
import { LibraryHeader } from "@/components/library/library-header";
import { SearchFilterRail } from "@/components/library/search-filter-rail";
import { RecipeGrid } from "@/components/library/recipe-grid";
import { CaptureSheet } from "@/components/capture/capture-sheet";
import { LaterLinksList, type LaterLinkStart } from "@/components/library/later-links-list";
import { closeRecipeSession } from "@/lib/nav/recipe-session";
import {
  filterRecipes,
  getPreferences,
  listRecipes,
  listTags,
  setPreferences,
  toggleFavorite,
  upsertRecipe,
} from "@/lib/db/queries";
import {
  archiveLaterLink,
  filterLaterLinks,
  listOpenLaterLinks,
} from "@/lib/db/later-links";
import { isRequiresManualInput } from "@/lib/extract/status";
import { useAutoCloudBackup } from "@/lib/db/sync";
import { backfillPhotolessSubtitles } from "@/lib/extract/backfill-subtitles";
import { hapticLight } from "@/lib/native/haptics";
import type {
  LaterLink,
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
  const [sort, setSort] = useState<LibrarySort>("recently_added");
  const [view, setView] = useState<LibraryView>("two");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [incomingShare, setIncomingShare] = useState<IncomingShare | null>(
    null
  );
  const [laterLinks, setLaterLinks] = useState<LaterLink[]>([]);
  const [laterLink, setLaterLink] = useState<{ id: string; url: string } | null>(
    null
  );
  const [startAction, setStartAction] = useState<LaterLinkStart | null>(null);
  const [ready, setReady] = useState(false);

  useAutoCloudBackup();

  async function refresh() {
    const [r, t, links] = await Promise.all([
      listRecipes(),
      listTags(),
      listOpenLaterLinks(),
    ]);
    setRecipes(r);
    setTags(t);
    setLaterLinks(links);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [r, t, prefs, links] = await Promise.all([
        listRecipes(),
        listTags(),
        getPreferences(),
        listOpenLaterLinks(),
      ]);
      if (cancelled) return;
      setRecipes(r);
      setTags(t);
      setLaterLinks(links);
      setSort(prefs.library_sort ?? "recently_added");
      setView(prefs.library_view ?? "two");
      setReady(true);
      const filled = await backfillPhotolessSubtitles();
      if (!cancelled && filled > 0) await refresh();
    })();

    const onVaultChanged = () => {
      void refresh();
    };
    window.addEventListener("rendo:vault-changed", onVaultChanged);

    const openShared = (share: IncomingShare) => {
      closeRecipeSession();
      setIncomingShare((prev) => mergeIncomingShares(prev, share));
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

  const showingLater = filter === "later";
  const visible = useMemo(
    () => filterRecipes(recipes, { query, filter, sort }),
    [recipes, query, filter, sort]
  );
  const visibleLater = useMemo(
    () => filterLaterLinks(laterLinks, query),
    [laterLinks, query]
  );

  function openLaterExtract(link: LaterLink, start: LaterLinkStart) {
    setLaterLink({ id: link.id, url: link.url });
    setStartAction(start);
    setCaptureOpen(true);
  }

  async function extractFromLaterPage(link: LaterLink, text: string) {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "text",
        payload: `Source URL: ${link.url}\n\n${text}`.slice(0, 40000),
        media: null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Couldn't extract that page.");
    }
    if (isRequiresManualInput(data)) {
      throw new Error(
        "No recipe found on that page. Paste the text or add a photo."
      );
    }
    const recipes = data.recipes as Recipe[];
    if (!recipes?.length) {
      throw new Error(
        "No recipe found on that page. Paste the text or add a photo."
      );
    }
    for (const recipe of recipes) {
      await upsertRecipe(recipe);
    }
    await archiveLaterLink(link.id);
    await backfillPhotolessSubtitles();
    await refresh();
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-primary">
      <div className="mx-auto w-full max-w-3xl shrink-0 bg-bg-primary">
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
          laterCount={laterLinks.length}
        />
      </div>
      {ready ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none">
          <div className="mx-auto w-full max-w-3xl">
            {showingLater ? (
              <LaterLinksList
                links={visibleLater}
                onExtract={openLaterExtract}
                onExtractPageText={extractFromLaterPage}
              />
            ) : (
              <RecipeGrid
                recipes={visible}
                columns={view}
                onToggleFavorite={(id) => void handleToggleFavorite(id)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-16 text-center text-sm text-text-secondary">
          Loading vault…
        </div>
      )}
      <CaptureSheet
        open={captureOpen}
        incomingShare={incomingShare}
        laterLink={laterLink}
        startAction={startAction}
        onOpenChange={(next) => {
          setCaptureOpen(next);
          if (!next) {
            setIncomingShare(null);
            setLaterLink(null);
            setStartAction(null);
          }
        }}
        onLaterLinkSaved={() => {
          setFilter("later");
          void refresh();
        }}
        onImported={() => {
          void (async () => {
            await backfillPhotolessSubtitles();
            await refresh();
          })();
        }}
      />
    </div>
  );
}
