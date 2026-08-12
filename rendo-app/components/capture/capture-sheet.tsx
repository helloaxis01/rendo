"use client";

import { useState } from "react";
import {
  ClipboardPaste,
  Camera,
  ImageIcon,
  FileText,
  Type,
} from "lucide-react";
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

type ExtractType = "url" | "ocr" | "upload" | "document" | "text" | "html";

type MediaPayload = {
  mimeType: string;
  data: string;
};

const MAX_IMAGE_EDGE = 1600;
const MAX_MEDIA_BYTES = 4_500_000;

export function CaptureSheet({ open, onOpenChange, onImported }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runExtract(
    type: ExtractType,
    payload: string,
    media?: MediaPayload | null
  ) {
    setBusy(true);
    setStatus("Extracting…");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload, media: media ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(cleanStatus(data.error || "Extract failed"));

      const recipes = data.recipes as Recipe[];
      if (!recipes?.length) {
        throw new Error(
          cleanStatus(
            data.warning ||
              "No recipes found in that source. Try Paste Recipe Text."
          )
        );
      }

      for (const recipe of recipes) {
        await upsertRecipe(recipe);
      }
      const extra = cleanStatus(data.warning || "");
      setStatus(
        `Saved ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}${
          extra ? ` — ${extra}` : data.mode === "mock" ? " (offline stub)" : ""
        }.`
      );
      onImported?.(recipes);
      setTimeout(() => onOpenChange(false), 900);
    } catch (err) {
      setStatus(
        cleanStatus(err instanceof Error ? err.message : "Capture failed")
      );
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteLink() {
    let clipboard = "";
    let url = "";
    try {
      clipboard = await navigator.clipboard.readText();
      url = clipboard.match(/https?:\/\/\S+/i)?.[0] ?? "";
    } catch {
      // clipboard blocked
    }
    if (!url) {
      setStatus("No URL found on clipboard. Copy a recipe link first.");
      const fallback = window.prompt("Paste recipe URL");
      if (!fallback?.trim()) return;
      clipboard = fallback.trim();
      url = clipboard.match(/https?:\/\/\S+/i)?.[0] ?? clipboard.trim();
    }

    // Instagram shares often include caption text + URL. Prefer that caption
    // over a server fetch when the clipboard already has real recipe text.
    const captionBesideUrl = clipboard
      .replace(url, " ")
      .replace(/\s+/g, " ")
      .trim();
    const looksLikeInstagram = /instagram\.com|instagr\.am/i.test(url);
    if (
      looksLikeInstagram &&
      captionBesideUrl.length >= 60 &&
      /\n|,|•|- |\d+\s*(cup|tbsp|tsp|oz)|ingredients?/i.test(clipboard)
    ) {
      await runExtract(
        "text",
        `Source URL: ${url}\n\n${clipboard.trim()}`.slice(0, 40000)
      );
      return;
    }

    // Prefer server URL extract first — sites like Julia's Album expose
    // JSON-LD that Netlify can read. Browser readers often return fluff
    // markdown that forces a broken Gemini fallback.
    setBusy(true);
    setStatus(
      looksLikeInstagram ? "Reading Instagram caption…" : "Reading recipe page…"
    );
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", payload: url, media: null }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.recipes) && data.recipes.length > 0) {
        for (const recipe of data.recipes as Recipe[]) {
          await upsertRecipe(recipe);
        }
        const extra = cleanStatus(data.warning || "");
        setStatus(
          `Saved ${data.recipes.length} recipe${
            data.recipes.length === 1 ? "" : "s"
          }${extra ? ` — ${extra}` : ""}.`
        );
        onImported?.(data.recipes as Recipe[]);
        setBusy(false);
        setTimeout(() => onOpenChange(false), 900);
        return;
      }
      // Surface IG-specific failures instead of falling into useless SPA HTML
      if (looksLikeInstagram && data.warning) {
        setBusy(false);
        setStatus(cleanStatus(data.warning));
        return;
      }
    } catch {
      // try browser proxies next
    }

    try {
      const page = await fetchRecipePageInBrowser(url);
      if (page?.kind === "html") {
        setBusy(false);
        await runExtract(
          "html",
          `Source URL: ${url}\n\n${page.body.slice(0, 350000)}`
        );
        return;
      }
      if (page?.kind === "text" && page.body.length > 80) {
        setBusy(false);
        await runExtract(
          "text",
          `Source URL: ${url}\n\n${page.body.slice(0, 40000)}`
        );
        return;
      }
    } catch {
      // fall through
    }

    setBusy(false);
    setStatus(
      cleanStatus(
        looksLikeInstagram
          ? "Couldn’t read that Instagram caption. Copy the caption and use Paste Recipe Text."
          : "Couldn’t read that recipe page. Try Paste Recipe Text."
      )
    );
  }

  async function handlePasteText() {
    const text = window.prompt(
      "Paste recipe text (ingredients + steps)",
      ""
    );
    if (!text?.trim()) return;
    await runExtract("text", text.trim());
  }

  async function handleFile(
    type: "upload" | "document" | "ocr",
    accept: string,
    capture?: boolean
  ) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) {
      input.setAttribute("capture", "environment");
    }
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setBusy(true);
        setStatus(`Reading ${file.name}…`);
        const prepared = await prepareFile(file);
        await runExtract(type, prepared.payload, prepared.media);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Couldn’t read that file");
        setBusy(false);
      }
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
            hint="Fetches the page and extracts the recipe"
            disabled={busy}
            onClick={() => void handlePasteLink()}
          />
          <CaptureOption
            icon={<Type className="h-5 w-5" />}
            label="Paste Recipe Text"
            hint="Ingredients + steps from any source"
            disabled={busy}
            onClick={() => void handlePasteText()}
          />
          <CaptureOption
            icon={<Camera className="h-5 w-5" />}
            label="Scan Cookbook or Card"
            hint="Camera or photo — vision extraction"
            disabled={busy}
            onClick={() => void handleFile("ocr", "image/*", true)}
          />
          <CaptureOption
            icon={<ImageIcon className="h-5 w-5" />}
            label="Upload Photo from Library"
            hint="Gallery image — vision extraction"
            disabled={busy}
            onClick={() => void handleFile("upload", "image/*")}
          />
          <CaptureOption
            icon={<FileText className="h-5 w-5" />}
            label="Import Document / File"
            hint="PDF, text, or markdown"
            disabled={busy}
            onClick={() =>
              void handleFile("document", ".pdf,.txt,.md,.text,text/plain,application/pdf")
            }
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

async function prepareFile(file: File): Promise<{
  payload: string;
  media: MediaPayload | null;
}> {
  const mime = file.type || guessMime(file.name);

  if (mime.startsWith("image/")) {
    const media = await fileToCompressedImageMedia(file);
    return {
      payload: `IMAGE FILE: ${file.name} (${media.mimeType})`,
      media,
    };
  }

  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const data = await fileToBase64(file);
    if (data.length * 0.75 > MAX_MEDIA_BYTES) {
      throw new Error("PDF is too large (max ~4MB). Try a smaller file or paste text.");
    }
    return {
      payload: `PDF FILE: ${file.name}`,
      media: { mimeType: "application/pdf", data },
    };
  }

  const text = await file.text();
  const clipped = text.trim().slice(0, 40000);
  if (!clipped) {
    throw new Error("That file looks empty. Try another file or paste text.");
  }
  return {
    payload: `FILE: ${file.name}\n\n${clipped}`,
    media: null,
  };
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) reject(new Error("Couldn’t read file data"));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Couldn’t read file"));
    reader.readAsDataURL(file);
  });
}

async function fileToCompressedImageMedia(file: File): Promise<MediaPayload> {
  // Prefer canvas compression to keep request size under API / body limits.
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.72)
    );
    if (!blob) throw new Error("Image compress failed");
    if (blob.size > MAX_MEDIA_BYTES) {
      throw new Error("Image is still too large after compression.");
    }
    const data = await fileToBase64(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    return { mimeType: "image/jpeg", data };
  } catch {
    const data = await fileToBase64(file);
    if (data.length * 0.75 > MAX_MEDIA_BYTES) {
      throw new Error("Image is too large (max ~4MB). Try a smaller photo.");
    }
    return { mimeType: file.type || "image/jpeg", data };
  }
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

function cleanStatus(message: string): string {
  if (!message) return "";
  if (
    /API_KEY_INVALID|API key not valid|GoogleGenerativeAI|generativelanguage|LocalizedMes|ErrorInfo|googleapis\.com|"@type"|google\.rpc|\{"@type"|generateContent|400 Bad Request/i.test(
      message
    )
  ) {
    return "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
  }
  // Never show JSON blobs in the capture sheet
  if (message.includes("{") || message.includes("@type")) {
    return "Gemini request failed. Update GEMINI_API_KEY on Netlify, or use Paste Recipe Text.";
  }
  return message;
}

async function fetchRecipePageInBrowser(
  url: string
): Promise<{ kind: "html" | "text"; body: string } | null> {
  const igMatch = url.match(
    /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  // Prefer HTML proxies first so JSON-LD survives; Jina markdown is last resort.
  const attempts: Array<() => Promise<{ kind: "html" | "text"; body: string } | null>> =
    [
      ...(igMatch
        ? [
            async () => {
              const code = igMatch[1];
              for (const mirror of [
                `https://imginn.com/p/${code}/`,
                `https://imginn.com/reel/${code}/`,
              ]) {
                const res = await fetch(
                  `https://api.allorigins.win/raw?url=${encodeURIComponent(mirror)}`
                );
                if (!res.ok) continue;
                const body = (await res.text()).trim();
                if (body.length < 80 || !/class="desc"/i.test(body)) continue;
                return { kind: "html" as const, body };
              }
              return null;
            },
          ]
        : []),
      async () => {
        const res = await fetch(
          `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        );
        if (!res.ok) return null;
        const body = (await res.text()).trim();
        if (body.length < 80) return null;
        return {
          kind: /<html[\s>]|application\/ld\+json/i.test(body)
            ? "html"
            : "text",
          body,
        };
      },
      async () => {
        const res = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(url)}`
        );
        if (!res.ok) return null;
        const body = (await res.text()).trim();
        if (body.length < 80) return null;
        return {
          kind: /<html[\s>]|application\/ld\+json/i.test(body)
            ? "html"
            : "text",
          body,
        };
      },
      async () => {
        const res = await fetch(`https://r.jina.ai/${url}`, {
          headers: { Accept: "text/plain,*/*" },
        });
        if (!res.ok) return null;
        const body = (await res.text()).trim();
        return body.length > 80 ? { kind: "text", body } : null;
      },
    ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch {
      // try next
    }
  }
  return null;
}
