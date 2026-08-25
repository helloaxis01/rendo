"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingBasket, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { groupShoppingItems } from "@/lib/shopping/merge";
import {
  clearCheckedShoppingItems,
  clearShoppingList,
  listShoppingItems,
  setShoppingItemChecked,
} from "@/lib/shopping/store";
import type { ShoppingItem } from "@/lib/shopping/types";
import { formatAmount } from "@/lib/units";
import { sharePlainText } from "@/lib/native/share";
import { hapticLight } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

function lineLabel(item: ShoppingItem) {
  const qty = formatAmount(item.amount, item.unit);
  const unit = item.unit?.trim() ?? "";
  const measure = [qty, unit].filter(Boolean).join(" ");
  return measure ? `${measure} ${item.name}` : item.name;
}

export function ShoppingScreen() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems(await listShoppingItems());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groups = groupShoppingItems(items);
  const checkedCount = items.filter((item) => item.checked).length;

  async function handleSendToReminders() {
    if (!items.length) return;
    const lines = items.map((item) => `☐ ${lineLabel(item)}`);
    const text = `Shopping list\n\n${lines.join("\n")}`;
    try {
      const result = await sharePlainText({ title: "Shopping list", text });
      if (result === "copied") {
        alert("List copied. Paste it into Reminders.");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        alert("List copied. Paste it into Reminders.");
      } catch {
        // dismissed / blocked
      }
    }
  }

  return (
    <div className="shopping-scroll mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary pt-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))]">
      <header className="sticky top-0 z-40 border-b border-border-hairline bg-bg-primary">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/"
            aria-label="Back to library"
            className="flex h-10 w-10 items-center justify-center rounded-full text-text-primary ring-1 ring-border-hairline"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] leading-none tracking-tight">
              Shopping List
            </h1>
            <p className="mt-1 text-[12px] text-text-secondary">
              {items.length
                ? `${items.length} item${items.length === 1 ? "" : "s"} · merged by name`
                : "Add items from any recipe"}
            </p>
          </div>
          <ShoppingBasket className="h-5 w-5 text-text-secondary" aria-hidden />
        </div>
      </header>

      <div className="px-4 py-5 pb-[max(6rem,env(safe-area-inset-bottom))]">
        {!items.length ? (
          <div className="rounded-[20px] border border-dashed border-border-hairline px-5 py-12 text-center">
            <p className="font-display text-lg tracking-wide">List is empty</p>
            <p className="mt-2 text-sm text-text-secondary">
              On a recipe, tap the list icon beside an ingredient. Same names
              from sauce and main combine here. Recipe pages stay separate.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex h-11 items-center rounded-full bg-text-primary px-5 text-sm font-semibold text-bg-primary"
            >
              Browse recipes
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border-hairline rounded-[20px] border border-border-hairline bg-bg-surface">
              {groups.map((group) =>
                group.items.map((item, index) => {
                  const showName = index === 0;
                  const qty = formatAmount(item.amount, item.unit);
                  const unit = item.unit?.trim() ?? "";
                  const measure = [qty, unit].filter(Boolean).join(" ");
                  const uniqueSources = [
                    ...new Set(
                      item.sources.map((s) => s.recipe_title).filter(Boolean)
                    ),
                  ];

                  return (
                    <li key={item.id}>
                      <label className="flex min-h-[56px] cursor-pointer items-start gap-3 px-3.5 py-3.5">
                        <Checkbox
                          checked={item.checked}
                          onCheckedChange={(v) => {
                            void hapticLight();
                            void setShoppingItemChecked(
                              item.id,
                              v === true
                            ).then(reload);
                          }}
                          aria-label={`Check ${item.name}`}
                          className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-[6px]"
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-[15px] leading-[22px]",
                            item.checked
                              ? "text-text-secondary line-through opacity-50"
                              : "text-text-primary"
                          )}
                        >
                          {showName ? (
                            <span className="block font-semibold">
                              {item.name}
                            </span>
                          ) : (
                            <span className="block text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
                              also
                            </span>
                          )}
                          {measure ? (
                            <span className="mt-0.5 block tabular-nums">
                              {measure}
                            </span>
                          ) : null}
                          {uniqueSources.length ? (
                            <span className="mt-1 block text-[12px] text-text-secondary">
                              From {uniqueSources.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="mt-5 flex flex-col gap-2">
              <Button
                type="button"
                className="h-12 w-full rounded-full"
                onClick={() => void handleSendToReminders()}
              >
                Send to Reminders
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 flex-1 rounded-full"
                  disabled={!checkedCount || busy}
                  onClick={() => {
                    setBusy(true);
                    void clearCheckedShoppingItems()
                      .then(setItems)
                      .finally(() => setBusy(false));
                  }}
                >
                  Clear checked
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 flex-1 rounded-full"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm("Clear the whole shopping list?")) return;
                    setBusy(true);
                    void clearShoppingList()
                      .then(() => setItems([]))
                      .finally(() => setBusy(false));
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear all
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
