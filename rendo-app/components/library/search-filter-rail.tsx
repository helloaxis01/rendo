"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Columns2, Heart, Rows2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ensureFilterPillOrder } from "@/lib/db/queries";
import type { LibrarySort, LibraryView, TagRecord } from "@/lib/db/types";

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "recently_added", label: "Recently Added" },
  { value: "title", label: "A–Z" },
  { value: "prep_time", label: "Cook Time" },
  { value: "most_cooked", label: "Most Cooked" },
];

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  activeFilter: string | null;
  onFilterChange: (value: string | null) => void;
  tags: TagRecord[];
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  kitchenOpen?: boolean;
  onKitchenOpenChange?: (open: boolean) => void;
};

export function SearchFilterRail({
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  tags,
  sort,
  onSortChange,
  view,
  onViewChange,
  kitchenOpen = false,
  onKitchenOpenChange,
}: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const [pillOrder, setPillOrder] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const order = await ensureFilterPillOrder(tags.map((t) => t.name));
      if (!cancelled) setPillOrder(order);
    })();
    return () => {
      cancelled = true;
    };
  }, [tags]);

  const orderedTags = useMemo(() => {
    const byName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));
    return pillOrder
      .map((name) => byName.get(name.toLowerCase()))
      .filter((t): t is TagRecord => Boolean(t));
  }, [tags, pillOrder]);

  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Recently Added";

  function toggleFilter(value: string) {
    onFilterChange(activeFilter === value ? null : value);
  }

  return (
    <div className="space-y-3 pb-3 pt-2">
      <div className="px-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search cheese, pasta, titles…"
            aria-label="Search recipes and ingredients"
            className="flex h-11 w-full rounded-full border border-border-hairline bg-bg-surface pl-10 pr-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          />
        </label>
      </div>

      <div className="relative flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-hairline bg-bg-surface px-2.5 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
          >
            Sort: {sortLabel}
            <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
          </button>
          <button
            type="button"
            aria-pressed={kitchenOpen}
            aria-label="What's in your kitchen"
            onClick={() => onKitchenOpenChange?.(!kitchenOpen)}
            className={cn(
              "inline-flex h-8 items-center rounded-md border px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
              kitchenOpen
                ? "border-text-primary bg-text-primary text-bg-primary"
                : "border-border-hairline bg-bg-surface text-text-primary"
            )}
          >
            Kitchen
          </button>
        </div>

        <div
          className="inline-flex h-8 items-center rounded-full bg-bg-muted p-0.5"
          role="group"
          aria-label="Library columns"
        >
          <button
            type="button"
            aria-pressed={view === "one"}
            aria-label="One column view"
            onClick={() => onViewChange("one")}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
              view === "one"
                ? "bg-text-primary text-bg-primary"
                : "text-text-secondary"
            )}
          >
            <Rows2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-pressed={view === "two"}
            aria-label="Two column view"
            onClick={() => onViewChange("two")}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
              view === "two"
                ? "bg-text-primary text-bg-primary"
                : "text-text-secondary"
            )}
          >
            <Columns2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {sortOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close sort menu"
              onClick={() => setSortOpen(false)}
            />
            <ul
              role="listbox"
              className="absolute left-4 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border-hairline bg-bg-surface py-1 shadow-lg"
            >
              {SORT_OPTIONS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sort === option.value}
                    className={cn(
                      "flex w-full px-3 py-2.5 text-left text-sm",
                      sort === option.value
                        ? "bg-text-primary text-bg-primary"
                        : "text-text-primary hover:bg-bg-primary"
                    )}
                    onClick={() => {
                      onSortChange(option.value);
                      setSortOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div
        className="overflow-x-auto overflow-y-hidden pl-5 pr-0 scrollbar-none"
        style={{
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
        }}
      >
        <div className="flex w-max flex-nowrap items-center gap-2">
          <FilterPill
            active={activeFilter === null}
            onClick={() => onFilterChange(null)}
          >
            All
          </FilterPill>
          <FilterPill
            active={activeFilter === "favorites"}
            onClick={() => toggleFilter("favorites")}
          >
            <Heart className="h-3.5 w-3.5 shrink-0" />
            Favorites
          </FilterPill>
          <FilterPill
            active={activeFilter === "recent"}
            onClick={() => toggleFilter("recent")}
          >
            Recent
          </FilterPill>
          <FilterPill
            active={activeFilter === "cooked"}
            onClick={() => toggleFilter("cooked")}
          >
            Cooked
          </FilterPill>
          {orderedTags.map((tag) => (
            <FilterPill
              key={tag.id}
              active={activeFilter?.toLowerCase() === tag.name.toLowerCase()}
              onClick={() => toggleFilter(tag.name)}
            >
              {tag.name}
            </FilterPill>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border-hairline bg-bg-surface/80 text-text-secondary"
      )}
    >
      {children}
    </button>
  );
}
