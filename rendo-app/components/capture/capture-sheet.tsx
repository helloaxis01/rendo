"use client";

import { useState } from "react";
import { ClipboardPaste, Camera, ImageIcon, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { upsertRecipe } from "@/lib/db/queries";
import type { Recipe } from "@/lib/db/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (recipes: Recipe[]) => void;
};

export function CaptureSheet({ open, onOpenChange, onImported }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runExtract(type: "url" | "ocr" | "upload" | "document", payload: string) {
    setBusy(true);
    setStatus("Extracting…");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extract failed");

      const recipes = data.recipes as Recipe[];
      for (const recipe of recipes) {
        await upsertRecipe(recipe);
      }
      setStatus(
        `Saved ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}${
          data.mode === "mock"
            ? data.warning
              ? ` — ${data.warning}`
              : " (mock — set GEMINI_API_KEY)"
            : ""
        }.`
      );
      onImported?.(recipes);
      setTimeout(() => onOpenChange(false), 700);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      const url = text.match(/https?:\/\/\S+/i)?.[0];
      if (!url) {
        setStatus("No URL found on clipboard. Copy a recipe link first.");
        return;
      }
      await runExtract("url", url);
    } catch {
      setStatus("Clipboard access denied. Paste a URL when prompted.");
      const fallback = window.prompt("Paste recipe URL");
      if (fallback) await runExtract("url", fallback);
    }
  }

  async function handleFile(
    type: "upload" | "document" | "ocr",
    accept: string
  ) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text().catch(() => file.name);
      await runExtract(type, `FILE: ${file.name}\n\n${text.slice(0, 12000)}`);
    };
    input.click();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setStatus(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CAPTURE</DialogTitle>
          <DialogDescription>
            Extract functional cooking facts only — no fluff.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <CaptureOption
            icon={<ClipboardPaste className="h-5 w-5" />}
            label="Paste Link"
            hint="Auto-detect URL from clipboard"
            disabled={busy}
            onClick={handlePasteLink}
          />
          <CaptureOption
            icon={<Camera className="h-5 w-5" />}
            label="Scan Cookbook or Card"
            hint="1-snap vision camera"
            disabled={busy}
            onClick={() => handleFile("ocr", "image/*")}
          />
          <CaptureOption
            icon={<ImageIcon className="h-5 w-5" />}
            label="Upload Photo from Library"
            hint="Gallery image"
            disabled={busy}
            onClick={() => handleFile("upload", "image/*")}
          />
          <CaptureOption
            icon={<FileText className="h-5 w-5" />}
            label="Import Document / File"
            hint="Import a PDF or text file"
            disabled={busy}
            onClick={() => handleFile("document", ".pdf,.txt,.md,.doc,.docx")}
          />
        </div>

        {status && (
          <p className="mt-4 text-sm text-text-secondary" role="status">
            {status}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CaptureOption({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto min-h-14 justify-start gap-3 px-4 py-3 text-left"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="text-text-primary">{icon}</span>
      <span className="flex flex-col items-start gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-xs font-normal text-text-secondary">{hint}</span>
      </span>
    </Button>
  );
}
