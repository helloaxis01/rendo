"use client";

import { useEffect, useRef, useState } from "react";
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
import type { IncomingShare } from "@/lib/native/incoming-share";
import {
  INSTAGRAM_CAPTION_MISSING,
  captionBesideUrls,
  explainInstagramCaptionGate,
  hasUsableInstagramCaption,
  isInstagramUrl,
  logInstagramShare,
} from "@/lib/extract/instagram";
import {
  canUseNativeCamera,
  isImagePickCanceled,
  pickNativeImage,
} from "@/lib/native/pick-image";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (recipes: Recipe[]) => void;
  incomingShare?: IncomingShare | null;
};

type ExtractType = "url" | "ocr" | "upload" | "document" | "text" | "html";

type MediaPayload = {
  mimeType: string;
  data: string;
};

const DEBUG_SHARE = true;
const DEBUG_BUILD = "2026-08-16-ig-fetch-2";
const EXTRACTING_STATUS =
  "Extracting functional cooking facts only. No fluff. This may take a minute.";
const WAITING_CAPTION_STATUS =
  "Looking for the Instagram caption…";
const CAPTION_WAIT_MS = 5000;
const CAPTION_RETRY_MS = 2000;
const MAX_MEDIA_BYTES = 4_500_000;
const MAX_IMAGE_EDGE = 1600;

export function CaptureSheet({
  open,
  onOpenChange,
  onImported,
  incomingShare,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [importPhase, setImportPhase] = useState<
    "idle" | "waiting" | "extracting" | "done" | "error"
  >("idle");
  const [shareDebug, setShareDebug] = useState<{
    url: string;
    text: string;
    gate: string;
    path: string;
    result: string;
  }>({ url: "", text: "", gate: "—", path: "—", result: "—" });
  const ingestedShareKey = useRef<string | null>(null);
  const ingestedCaptionLen = useRef(0);
  const latestShareRef = useRef<IncomingShare | null>(null);
  const captionWaitRef = useRef<number | null>(null);
  const captionRetryRef = useRef<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const nativePickRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function clearCaptionWait() {
    if (captionWaitRef.current != null) {
      window.clearTimeout(captionWaitRef.current);
      captionWaitRef.current = null;
    }
    if (captionRetryRef.current != null) {
      window.clearTimeout(captionRetryRef.current);
      captionRetryRef.current = null;
    }
  }

  function scheduleCaptionRetry() {
    if (captionRetryRef.current != null) {
      window.clearTimeout(captionRetryRef.current);
    }
    captionRetryRef.current = window.setTimeout(() => {
      captionRetryRef.current = null;
      const latest = latestShareRef.current;
      const nextLen = (latest?.text ?? "").trim().length;
      logInstagramShare("retry-check", latest, {
        ingestedCaptionLen: ingestedCaptionLen.current,
        latestTextLength: nextLen,
      });
      if (!latest || nextLen <= ingestedCaptionLen.current) return;
      logInstagramShare("retry-extract", latest);
      ingestedShareKey.current = `${latest.url?.trim() ?? ""}|${latest.text?.trim() ?? ""}`;
      ingestedCaptionLen.current = nextLen;
      void ingestIncomingShare(latest);
    }, CAPTION_RETRY_MS);
  }

  function patchShareDebug(partial: Partial<typeof shareDebug>) {
    if (!DEBUG_SHARE) return;
    setShareDebug((prev) => ({ ...prev, ...partial }));
  }

  function cancelInFlight() {
    abortRef.current?.abort();
    abortRef.current = null;
    clearCaptionWait();
    setBusy(false);
    setPicking(false);
    setImportPhase("idle");
    setStatus(null);
  }

  async function runExtract(
    type: ExtractType,
    payload: string,
    media?: MediaPayload | null
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    clearCaptionWait();
    setBusy(true);
    setImportPhase("extracting");
    setStatus(EXTRACTING_STATUS);
    patchShareDebug({ path: `extract:${type}`, result: "working" });
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload, media: media ?? null }),
        signal: controller.signal,
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
      setImportPhase("done");
      const saved = `Saved ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}${
        extra ? ` — ${extra}` : data.mode === "mock" ? " (offline stub)" : ""
      }.`;
      setStatus(saved);
      patchShareDebug({ result: saved });
      onImported?.(recipes);
      setTimeout(() => onOpenChange(false), 900);
    } catch (err) {
      if (isAbortError(err)) return;
      setImportPhase("error");
      const message = cleanStatus(
        err instanceof Error ? err.message : "Capture failed"
      );
      setStatus(message);
      patchShareDebug({ result: message });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function ingestUrlAndText(clipboard: string, url: string) {
    const looksLikeInstagram = isInstagramUrl(url);
    const combined = [clipboard.trim(), url.trim()]
      .filter(Boolean)
      .join("\n");

    if (looksLikeInstagram && hasUsableInstagramCaption(combined)) {
      await runExtract("text", `Source URL: ${url}\n\n${combined}`.slice(0, 40000));
      return;
    }

    if (looksLikeInstagram) {
      const stripped = captionBesideUrls(combined);
      const chrome = explainInstagramCaptionGate(combined).reason === "instagram chrome";
      if (stripped.length > 10 && !chrome) {
        patchShareDebug({
          path: "brute-force text extract (gate skipped)",
          result: "working",
        });
        await runExtract(
          "text",
          `Source URL: ${url}\n\n${combined}`.slice(0, 40000)
        );
        return;
      }
      patchShareDebug({
        path: "instagram url fetch (no share caption)",
        result: "working",
      });
      await runExtract("url", url);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setImportPhase("extracting");
    setStatus(EXTRACTING_STATUS);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", payload: url, media: null }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.recipes) && data.recipes.length > 0) {
        for (const recipe of data.recipes as Recipe[]) {
          await upsertRecipe(recipe);
        }
        const extra = cleanStatus(data.warning || "");
        setImportPhase("done");
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
      if (data.warning === INSTAGRAM_CAPTION_MISSING) {
        setBusy(false);
        setImportPhase("error");
        setStatus(INSTAGRAM_CAPTION_MISSING);
        return;
      }
    } catch (err) {
      if (isAbortError(err)) return;
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
    setImportPhase("error");
    setStatus(
      cleanStatus("Couldn’t read that recipe page. Try Paste Recipe Text.")
    );
  }

  async function ingestIncomingShare(share: IncomingShare) {
    const text = (share.text ?? "").trim();
    const url =
      share.url?.trim() || text.match(/https?:\/\/\S+/i)?.[0] || "";
    const combined = [text, url].filter(Boolean).join("\n");
    const stripped = captionBesideUrls(combined);
    const gate = explainInstagramCaptionGate(combined);
    logInstagramShare("before-gate", share, { combinedLength: combined.length });
    logInstagramShare("gate-decision", share, {
      usable: gate.pass,
      reason: gate.reason,
      isInstagram: Boolean(url && isInstagramUrl(url)),
    });
    patchShareDebug({
      url,
      text,
      gate: `${gate.pass ? "PASS" : "FAIL"} — ${gate.reason} (${gate.captionLength} chars)`,
    });

    if (stripped.length > 10 && gate.reason !== "instagram chrome") {
      patchShareDebug({
        path: gate.pass
          ? "text extract (gate pass)"
          : "brute-force text extract (gate fail, text > 10)",
        result: "working",
      });
      clearCaptionWait();
      scheduleCaptionRetry();
      await runExtract(
        "text",
        `Source URL: ${url || "https://rendo.local/import"}\n\n${combined}`.slice(
          0,
          40000
        )
      );
      return;
    }

    if (url && isInstagramUrl(url)) {
      patchShareDebug({
        path: "instagram url fetch (waiting/no caption on share)",
        result: "working",
      });
      clearCaptionWait();
      scheduleCaptionRetry();
      await runExtract("url", url);
      return;
    }
    clearCaptionWait();
    scheduleCaptionRetry();
    if (url) {
      patchShareDebug({ path: "url extract", result: "working" });
      await ingestUrlAndText(combined, url);
      return;
    }
    setImportPhase("error");
    setStatus("Nothing to import from that share.");
    patchShareDebug({ path: "empty share", result: "Nothing to import from that share." });
  }

  useEffect(() => {
    if (!open || !incomingShare) return;
    latestShareRef.current = incomingShare;
    const url = incomingShare.url?.trim() || "";
    const text = incomingShare.text?.trim() || "";
    logInstagramShare("capture-receipt", incomingShare);
    patchShareDebug({
      url,
      text,
      gate: (() => {
        const decision = explainInstagramCaptionGate(`${text}\n${url}`);
        return `${decision.pass ? "PASS" : "FAIL"} — ${decision.reason} (${decision.captionLength} chars)`;
      })(),
    });
    const key = `${url}|${text}`;
    if (!url && !text) return;
    if (ingestedShareKey.current === key) return;
    if (
      ingestedShareKey.current &&
      url &&
      ingestedShareKey.current.startsWith(`${url}|`) &&
      text.length <= ingestedCaptionLen.current
    ) {
      logInstagramShare("capture-skip-shorter", incomingShare, {
        ingestedCaptionLen: ingestedCaptionLen.current,
      });
      return;
    }
    ingestedShareKey.current = key;
    ingestedCaptionLen.current = text.length;
    void ingestIncomingShare(incomingShare);
  }, [open, incomingShare]);

  useEffect(() => {
    if (!DEBUG_SHARE) return;
    const onDebug = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; text?: string }>).detail;
      if (!detail) return;
      patchShareDebug({
        url: detail.url ?? "",
        text: detail.text ?? "",
      });
    };
    window.addEventListener("rendo:share-debug", onDebug);
    return () => window.removeEventListener("rendo:share-debug", onDebug);
  }, []);

  useEffect(() => {
    if (open) return;
    clearCaptionWait();
  }, [open]);

  useEffect(() => {
    if (!picking || nativePickRef.current) return;
    const release = () => {
      if (document.visibilityState === "hidden") return;
      window.setTimeout(() => setPicking(false), 600);
    };
    window.addEventListener("focus", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("focus", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [picking]);

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

    await ingestUrlAndText(clipboard, url);
  }

  async function handlePasteText() {
    const text = window.prompt(
      "Paste recipe text (ingredients + steps)",
      ""
    );
    if (!text?.trim()) return;
    await runExtract("text", text.trim());
  }

  async function readPickedFile(
    type: "upload" | "document" | "ocr",
    file: File | undefined
  ) {
    if (!file) return;
    try {
      setBusy(true);
      setStatus(EXTRACTING_STATUS);
      const prepared = await prepareFile(file, type !== "document");
      await runExtract(type, prepared.payload, prepared.media);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn’t read that file");
      setBusy(false);
    }
  }

  async function handleFile(
    type: "upload" | "document" | "ocr",
    via: "camera" | "library" | "document"
  ) {
    if (via !== "document" && canUseNativeCamera()) {
      nativePickRef.current = true;
      setPicking(true);
      setStatus(via === "camera" ? "Opening camera…" : "Opening photo library…");
      try {
        const file = await pickNativeImage(via);
        await readPickedFile(type, file);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          setStatus(
            err instanceof Error ? err.message : "Couldn’t open the camera"
          );
        } else {
          setStatus(null);
        }
      } finally {
        nativePickRef.current = false;
        setPicking(false);
      }
      return;
    }

    const input =
      via === "camera"
        ? cameraInputRef.current
        : via === "library"
          ? libraryInputRef.current
          : documentInputRef.current;
    if (!input) return;
    nativePickRef.current = false;
    setPicking(true);
    input.value = "";
    input.click();
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          cancelInFlight();
          ingestedShareKey.current = null;
          ingestedCaptionLen.current = 0;
        }
        onOpenChange(next);
      }}
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPicking(false);
          void readPickedFile("ocr", file);
        }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPicking(false);
          void readPickedFile("upload", file);
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.txt,.md,.text,text/plain,application/pdf"
        className="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPicking(false);
          void readPickedFile("document", file);
        }}
      />
      <DialogContent
        onPointerDownOutside={(event) => {
          if (picking) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (picking) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (picking) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>CAPTURE</DialogTitle>
          <DialogDescription>
            Extracting functional cooking facts only. No fluff. This may take a
            minute.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "mb-4 rounded-2xl border px-4 py-3",
            importPhase === "waiting" || importPhase === "extracting" || busy
              ? "border-amber-400 bg-amber-200 text-neutral-900"
              : importPhase === "done"
                ? "border-emerald-500 bg-emerald-200 text-neutral-900"
                : importPhase === "error"
                  ? "border-red-700 bg-red-600 text-white"
                  : "border-border-hairline bg-bg-surface text-text-primary"
          )}
          role="status"
          aria-live="polite"
        >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.14em]",
                importPhase === "error"
                  ? "text-white/80"
                  : importPhase === "idle"
                    ? "text-text-secondary"
                    : "text-neutral-800"
              )}
            >
              {importPhase === "waiting"
                ? "Import status — waiting"
                : importPhase === "extracting" || busy
                  ? "Import status — working"
                  : importPhase === "done"
                    ? "Import status — saved"
                    : importPhase === "error"
                      ? "Import status — failed"
                      : "Import status — ready"}
            </p>
            <div className="mt-2 flex items-start gap-3">
              {importPhase === "waiting" || busy ? (
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2",
                    importPhase === "error"
                      ? "border-white/40 border-t-white"
                      : "border-neutral-400 border-t-neutral-900"
                  )}
                  aria-hidden
                />
              ) : null}
              <p className="text-[15px] leading-snug">
                {busy
                  ? EXTRACTING_STATUS
                  : status ||
                    "Ready. Share a post to RENDO, or pick an input below."}
              </p>
            </div>
            {busy || importPhase === "waiting" ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full border-current bg-transparent"
                onClick={() => {
                  cancelInFlight();
                  ingestedShareKey.current = null;
                  ingestedCaptionLen.current = 0;
                  onOpenChange(false);
                }}
              >
                Cancel import
              </Button>
            ) : null}
          </div>

        {DEBUG_SHARE ? (
          <div className="mb-4 max-h-56 overflow-auto rounded-2xl border border-amber-500 bg-neutral-950 px-3 py-3 font-mono text-[11px] leading-snug text-amber-100">
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">
              Share debug (DEBUG_SHARE) · {DEBUG_BUILD}
            </p>
            <p>
              <span className="text-amber-400">URL</span> {shareDebug.url || "(none)"}
            </p>
            <p className="mt-1">
              <span className="text-amber-400">Text</span> {shareDebug.text.length} chars
            </p>
            <p className="mt-1 whitespace-pre-wrap break-all">
              {shareDebug.text.slice(0, 300) || "(empty)"}
            </p>
            <p className="mt-2">
              <span className="text-amber-400">Gate</span> {shareDebug.gate}
            </p>
            <p className="mt-1">
              <span className="text-amber-400">Path</span> {shareDebug.path}
            </p>
            <p className="mt-1">
              <span className="text-amber-400">Result</span> {shareDebug.result}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <CaptureOption
            icon={<ClipboardPaste className="h-5 w-5" />}
            label="Paste Link"
            hint="Paste a link — Instagram captions extract too"
            disabled={busy || picking}
            onClick={() => void handlePasteLink()}
          />
          <CaptureOption
            icon={<Type className="h-5 w-5" />}
            label="Paste Recipe Text"
            hint="Ingredients + steps from any source"
            disabled={busy || picking}
            onClick={() => void handlePasteText()}
          />
          <CaptureOption
            icon={<Camera className="h-5 w-5" />}
            label="Scan Cookbook or Card"
            hint="Camera or photo — vision extraction"
            disabled={busy || picking}
            onClick={() => void handleFile("ocr", "camera")}
          />
          <CaptureOption
            icon={<ImageIcon className="h-5 w-5" />}
            label="Upload Photo from Library"
            hint="Gallery image — vision extraction"
            disabled={busy || picking}
            onClick={() => void handleFile("upload", "library")}
          />
          <CaptureOption
            icon={<FileText className="h-5 w-5" />}
            label="Import Document / File"
            hint="PDF, text, or markdown"
            disabled={busy || picking}
            onClick={() => void handleFile("document", "document")}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

async function prepareFile(
  file: File,
  treatAsImage = false
): Promise<{
  payload: string;
  media: MediaPayload | null;
}> {
  const mime = file.type || guessMime(file.name);

  if (treatAsImage || mime.startsWith("image/")) {
    const media = await fileToCompressedImageMedia(file);
    return {
      payload: `IMAGE FILE: ${file.name || "capture.jpg"} (${media.mimeType})`,
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
  try {
    return await compressImage(file);
  } catch {
    const data = await fileToBase64(file);
    if (data.length * 0.75 > MAX_MEDIA_BYTES) {
      throw new Error("Image is too large (max ~4MB). Try a closer, clearer photo.");
    }
    return { mimeType: file.type || "image/jpeg", data };
  }
}

async function compressImage(file: File): Promise<MediaPayload> {
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap.image, 0, 0, width, height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.72)
  );
  if (!blob) throw new Error("Image compress failed");
  if (blob.size > MAX_MEDIA_BYTES) {
    throw new Error("Image is still too large after compression.");
  }
  const data = await fileToBase64(
    new File([blob], "capture.jpg", { type: "image/jpeg" })
  );
  return { mimeType: "image/jpeg", data };
}

async function decodeImage(file: File): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn’t decode that photo"));
      img.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
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

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
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
  if (isInstagramUrl(url)) return null;
  const attempts: Array<() => Promise<{ kind: "html" | "text"; body: string } | null>> =
    [
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
