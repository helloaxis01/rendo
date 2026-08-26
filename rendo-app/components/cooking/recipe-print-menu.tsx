"use client";

import { useState } from "react";
import { Mail, Printer, Share2 } from "lucide-react";
import type { Recipe } from "@/lib/db/types";
import type { UnitSystem } from "@/lib/units";
import {
  emailRecipeDocument,
  printRecipeDocument,
  shareRecipePdf,
} from "@/lib/print/print-recipe";
import { RecipePrintPreview } from "@/components/cooking/recipe-print-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hapticLight } from "@/lib/native/haptics";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe;
  servings: number;
  unitSystem: UnitSystem;
};

export function RecipePrintMenu({
  open,
  onOpenChange,
  recipe,
  servings,
  unitSystem,
}: Props) {
  const [busy, setBusy] = useState<"share" | null>(null);

  function close() {
    onOpenChange(false);
  }

  function handlePrint() {
    void hapticLight();
    close();
    window.setTimeout(() => printRecipeDocument(), 150);
  }

  function handleEmail() {
    void hapticLight();
    close();
    window.setTimeout(
      () => emailRecipeDocument(recipe, servings, unitSystem),
      150
    );
  }

  async function handleSharePdf() {
    void hapticLight();
    setBusy("share");
    try {
      await shareRecipePdf(recipe, servings, unitSystem);
      close();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,760px)] overflow-hidden p-0">
        <div className="flex max-h-[min(92dvh,760px)] flex-col">
          <DialogHeader className="border-b border-border-hairline px-5 pb-4 pt-5">
            <DialogTitle>Print or share</DialogTitle>
            <DialogDescription>
              Black-and-white layout with checkboxes for the ingredients list.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <RecipePrintPreview
              recipe={recipe}
              servings={servings}
              unitSystem={unitSystem}
            />
          </div>

          <div className="border-t border-border-hairline px-5 py-4">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-text-primary text-[15px] font-semibold text-bg-primary"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
              <button
                type="button"
                onClick={() => void handleSharePdf()}
                disabled={busy === "share"}
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-border-hairline bg-bg-surface text-[15px] font-semibold text-text-primary disabled:opacity-60"
              >
                <Share2 className="h-4 w-4" />
                {busy === "share" ? "Preparing PDF…" : "Share PDF"}
              </button>
              <button
                type="button"
                onClick={handleEmail}
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-border-hairline bg-bg-surface text-[15px] font-semibold text-text-primary"
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
