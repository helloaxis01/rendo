"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  LayoutGrid,
  List,
  Search,
  Star,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LibrarySort, LibraryView, TagRecord } from "@/lib/db/types";

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "recently_added", label: "Recently Added" },
  { value: "title", label: "Title" },
  { value: "prep_time", label: "Prep Time" },
];

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  activeFilter: string | null;
  onFilterChange: (value: string | null) => void;
  tags: TagRecord[];
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
};

export function SearchFilterRail({
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  tags,
  view,
  onViewChange,
  sort,
  onSortChange,
}: Props) {
  const [allOpen, setAllOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const topTags = useMemo(
    () => [...tags].sort((a, b) => b.count - a.count).slice(0, 8),
    [tags]
  );

  const alphaTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags]
  );

  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Recently Added";

  function toggleFilter(value: string) {
    onFilterChange(activeFilter === value ? null : value);
  }

  return (
    <div className="space-y-3 px-4 pb-3 pt-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search ingredients, titles..."
          aria-label="Search recipes"
          className="flex h-11 w-full rounded-full border border-border-hairline bg-bg-surface pl-10 pr-4 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        />
      </label>

      <div className="mask-fade-right -mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2 pb-1">
          <FilterPill
            active={activeFilter === "favorites"}
            onClick={() => toggleFilter("favorites")}
          >
            <Star className="h-3.5 w-3.5" />
            Favorites
          </FilterPill>
          <FilterPill
            active={activeFilter === "recent"}
            onClick={() => toggleFilter("recent")}
          >
            Recent
          </FilterPill>
          {topTags.map((tag) => (
            <FilterPill
              key={tag.id}
              active={activeFilter?.toLowerCase() === tag.name.toLowerCase()}
              onClick={() => toggleFilter(tag.name)}
            >
              {tag.name}
            </FilterPill>
          ))}
          <FilterPill active={false} onClick={() => setAllOpen(true)}>
            <Tag className="h-3.5 w-3.5" />
            All
          </FilterPill>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-hairline bg-bg-surface px-3 text-sm text-text-primary"
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
          >
            Sort: {sortLabel}
            <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
          </button>
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
                className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border-hairline bg-bg-surface py-1 shadow-lg"
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
          className="inline-flex rounded-full border border-border-hairline bg-bg-surface p-0.5"
          role="group"
          aria-label="Library view"
        >
          <button
            type="button"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
            className={cn(
              "flex h-8 w-9 items-center justify-center rounded-full transition-colors",
              view === "list"
                ? "bg-text-primary text-bg-primary"
                : "text-text-secondary"
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Tile view"
            aria-pressed={view === "tiles"}
            onClick={() => onViewChange("tiles")}
            className={cn(
              "flex h-8 w-9 items-center justify-center rounded-full transition-colors",
              view === "tiles"
                ? "bg-text-primary text-bg-primary"
                : "text-text-secondary"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ALL TAGS</DialogTitle>
            <DialogDescription>
              Alphabetical index of tags in your vault.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50vh] divide-y divide-border-hairline overflow-y-auto">
            {alphaTags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between py-3 text-left"
                  onClick={() => {
                    onFilterChange(tag.name);
                    setAllOpen(false);
                  }}
                >
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-sm text-text-secondary">{tag.count}</span>
                </button>
              </li>
            ))}
            {!alphaTags.length && (
              <li className="py-6 text-sm text-text-secondary">No tags yet.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
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
        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border-hairline bg-bg-surface text-text-primary"
      )}
    >
      {children}
    </button>
  );
}
