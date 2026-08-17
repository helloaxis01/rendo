"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ImageIcon,
  FileText,
  Link2,
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
  INSTAGRAM_USE_WEBSITE_MESSAGE,
  isInstagramUrl,
  logInstagramShare,
} from "@/lib/extract/instagram";
import { planShare } from "@/lib/capture/plan-share";
import {
  REQUIRES_PASTE_MESSAGE,
  isRequiresManualInput,
} from "@/lib/extract/status";
import {
  canUseNativeCamera,
  isImagePickCanceled,
  pickNativeImage,
  pickRecipeScreenshots,
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

const DEBUG_SHARE = false;
const READY_STATUS = "Add your recipe now.";
const EXTRACTING_STATUS = "Adding your recipe…";
const CAPTION_GRACE_MS = 1200;
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
    "idle" | "waiting" | "needs-input" | "extracting" | "done" | "error"
  >("idle");
  const [captionPromptUrl, setCaptionPromptUrl] = useState<string | null>(null);
  const [sheetView, setSheetView] = useState<"menu" | "paste-text" | "paste-link">(
    "menu"
  );
  const [pasteDraft, setPasteDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
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
  const captionGraceRef = useRef<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const nativePickRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function clearCaptionWait() {
    if (captionGraceRef.current != null) {
      window.clearTimeout(captionGraceRef.current);
      captionGraceRef.current = null;
    }
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
    setCaptionPromptUrl(null);
    setSheetView("menu");
    setPasteDraft("");
    setLinkDraft("");
  }

  async function runExtract(
    type: ExtractType,
    payload: string,
    media?: MediaPayload | MediaPayload[] | null
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

      if (isRequiresManualInput(data)) {
        const sourceUrl =
          payload.match(/https?:\/\/\S+/i)?.[0] ?? captionPromptUrl ?? "";
        await handleMissingSource(sourceUrl, data.message);
        return;
      }

      const recipes = data.recipes as Recipe[];
      if (!recipes?.length) {
        const warning = cleanStatus(
          data.warning ||
            "No recipes found in that source. Try pasting the recipe text."
        );
        const sourceUrl =
          payload.match(/https?:\/\/\S+/i)?.[0] ?? captionPromptUrl ?? "";
        if (sourceUrl) {
          await handleMissingSource(sourceUrl, warning);
          return;
        }
        throw new Error(warning);
      }

      for (const recipe of recipes) {
        await upsertRecipe(recipe);
      }
      const extra = cleanStatus(data.warning || "");
      setImportPhase("done");
      const saved = `Saved ${recipes.length} recipe${
        recipes.length === 1 ? "" : "s"
      }${extra ? ` — ${extra}` : data.mode === "mock" ? " (offline stub)" : ""}.`;
      setStatus(saved);
      patchShareDebug({ result: saved });
      onImported?.(recipes);
      setTimeout(() => onOpenChange(false), 900);
    } catch (err) {
      if (isAbortError(err)) return;
      setImportPhase("error");
      const message = cleanStatus(
        err instanceof Error ? err.message : "Couldn't add that recipe"
      );
      setStatus(message);
      patchShareDebug({ result: message });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function handleMissingSource(url: string, message?: string) {
    if (isInstagramUrl(url)) {
      askForMoreInput(url, INSTAGRAM_USE_WEBSITE_MESSAGE);
      return;
    }
    askForMoreInput(url, message);
  }

  function askForMoreInput(url: string, message = REQUIRES_PASTE_MESSAGE) {
    clearCaptionWait();
    setCaptionPromptUrl(url || null);
    setBusy(false);
    setImportPhase("needs-input");
    setStatus(message);
    setSheetView("menu");
    patchShareDebug({
      path: "needs-input",
      result: message,
      url,
    });
  }

  async function openPasteTextTab() {
    let clip = "";
    try {
      clip = (await navigator.clipboard.readText()).trim();
    } catch {
      clip = "";
    }
    const textDetected =
      clip.length >= 8 && !/^https?:\/\/\S+$/i.test(clip);
    setPasteDraft(textDetected ? clip : "");
    setSheetView("paste-text");
  }

  async function submitPasteText() {
    const text = pasteDraft.trim();
    if (!text) {
      setStatus("Paste the ingredients and steps, then tap Extract.");
      return;
    }
    const url = captionPromptUrl ?? latestShareRef.current?.url?.trim() ?? "";
    setSheetView("menu");
    await runExtract(
      "text",
      url ? `Source URL: ${url}\n\n${text}`.slice(0, 40000) : text
    );
  }

  async function ingestUrlAndText(clipboard: string, url: string) {
    const plan = planShare({ url, text: clipboard });
    patchShareDebug({ path: plan.kind, url, text: clipboard });
    if (plan.kind === "extract-text") {
      setCaptionPromptUrl(null);
      await runExtract("text", plan.payload);
      return;
    }
    if (plan.kind === "need-caption" || plan.kind === "need-website") {
      await handleMissingSource(plan.url);
      return;
    }
    if (plan.kind !== "extract-url") {
      setImportPhase("error");
      setStatus("Nothing to import from that link.");
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
      if (isRequiresManualInput(data) || isInstagramUrl(url)) {
        await handleMissingSource(url, data.message || data.warning);
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
    await handleMissingSource(url);
  }

  async function ingestIncomingShare(share: IncomingShare) {
    const plan = planShare(share);
    logInstagramShare("plan", share, { kind: plan.kind });
    patchShareDebug({
      url: share.url ?? "",
      text: share.text ?? "",
      path: plan.kind,
    });
    if (plan.kind === "extract-text") {
      clearCaptionWait();
      setCaptionPromptUrl(null);
      await runExtract("text", plan.payload);
      return;
    }
    if (plan.kind === "need-caption" || plan.kind === "need-website") {
      await handleMissingSource(plan.url);
      return;
    }
    if (plan.kind === "extract-url") {
      clearCaptionWait();
      await ingestUrlAndText(share.text ?? "", plan.url);
      return;
    }
    setImportPhase("error");
    setStatus("Nothing to import from that share.");
  }

  useEffect(() => {
    if (!open || !incomingShare) return;
    latestShareRef.current = incomingShare;
    const url = incomingShare.url?.trim() || "";
    const text = incomingShare.text?.trim() || "";
    logInstagramShare("capture-receipt", incomingShare);
    patchShareDebug({ url, text });
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

    const plan = planShare(incomingShare);
    ingestedShareKey.current = key;
    ingestedCaptionLen.current = text.length;

    if (plan.kind === "need-website") {
      void ingestIncomingShare(incomingShare);
      return;
    }

    if (plan.kind === "need-caption") {
      clearCaptionWait();
      setImportPhase("waiting");
      setStatus("Opening that share…");
      captionGraceRef.current = window.setTimeout(() => {
        captionGraceRef.current = null;
        const latest = latestShareRef.current ?? incomingShare;
        void ingestIncomingShare(latest);
      }, CAPTION_GRACE_MS);
      return;
    }

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

  async function openPasteLinkTab() {
    let clip = "";
    try {
      clip = (await navigator.clipboard.readText()).trim();
    } catch {
      clip = "";
    }
    const url = clip.match(/https?:\/\/\S+/i)?.[0] ?? "";
    setLinkDraft(url);
    setSheetView("paste-link");
  }

  async function submitPasteLink() {
    const raw = linkDraft.trim();
    const url = raw.match(/https?:\/\/\S+/i)?.[0] ?? raw;
    if (!url || !/^https?:\/\//i.test(url)) {
      setStatus("Paste a recipe website link, then tap Import.");
      return;
    }
    setSheetView("menu");
    await ingestUrlAndText(raw, url);
  }

  async function handlePasteLink() {
    await openPasteLinkTab();
  }

  async function handlePasteText() {
    await openPasteTextTab();
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
      const sourceUrl = captionPromptUrl ?? "";
      await runExtract(
        type,
        sourceUrl
          ? `Source URL: ${sourceUrl}\n\n${prepared.payload}`.slice(0, 40000)
          : prepared.payload,
        prepared.media
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn’t read that file");
      setBusy(false);
    }
  }

  async function readPickedImages(files: File[]) {
    const images = files.slice(0, 4);
    if (!images.length) return;
    try {
      setBusy(true);
      setStatus(EXTRACTING_STATUS);
      const media: MediaPayload[] = [];
      for (const file of images) {
        const prepared = await prepareFile(file, true);
        if (prepared.media) media.push(prepared.media);
      }
      if (!media.length) {
        throw new Error("Couldn't read those photos. Try again.");
      }
      const sourceUrl = captionPromptUrl ?? "";
      const payload = sourceUrl
        ? `Source URL: ${sourceUrl}\nIMAGE FILES: ${media.length} screenshot(s)`
        : `IMAGE FILES: ${media.length} screenshot(s)`;
      await runExtract("upload", payload, media.length === 1 ? media[0] : media);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn’t read that file");
      setBusy(false);
    }
  }

  async function handleFile(
    type: "upload" | "document" | "ocr",
    via: "camera" | "library" | "document"
  ) {
    if (via === "library" && canUseNativeCamera()) {
      nativePickRef.current = true;
      setPicking(true);
      setStatus("Opening photo library…");
      try {
        const files = await pickRecipeScreenshots(4);
        await readPickedImages(files);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          setStatus(
            err instanceof Error ? err.message : "Couldn’t open the photo library"
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

    if (via !== "document" && canUseNativeCamera()) {
      nativePickRef.current = true;
      setPicking(true);
      setStatus("Opening camera…");
      try {
        const file = await pickNativeImage("camera");
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
        multiple
        className="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          setPicking(false);
          void readPickedImages(files);
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
          <DialogTitle>ADD RECIPE</DialogTitle>
          <DialogDescription>
            Choose the best method below to import your recipe.
          </DialogDescription>
        </DialogHeader>

        <div
          className="mb-4 rounded-xl border border-border-hairline bg-bg-muted/70 px-3.5 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <StatusMark
              tone={
                importPhase === "waiting" ||
                importPhase === "extracting" ||
                busy
                  ? "working"
                  : importPhase === "done"
                    ? "done"
                    : importPhase === "error" || importPhase === "needs-input"
                      ? "attention"
                      : "idle"
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                {importPhase === "waiting"
                  ? "Waiting"
                  : importPhase === "needs-input"
                    ? "Needs more"
                    : importPhase === "extracting" || busy
                      ? "Adding"
                      : importPhase === "done"
                        ? "Saved"
                        : importPhase === "error"
                          ? "Couldn't add"
                          : "Ready"}
              </p>
              <p className="mt-1 text-[14px] leading-snug text-text-primary">
                {busy ? EXTRACTING_STATUS : status || READY_STATUS}
              </p>
              {importPhase === "needs-input" && sheetView === "menu" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy || picking}
                    onClick={() => void openPasteLinkTab()}
                  >
                    Paste a Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy || picking}
                    onClick={() => void openPasteTextTab()}
                  >
                    Type or Paste Recipe Text
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy || picking}
                    onClick={() => void handleFile("upload", "library")}
                  >
                    Photo from Library
                  </Button>
                </div>
              ) : null}
              {busy || importPhase === "waiting" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
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
          </div>
        </div>

        {sheetView === "paste-link" ? (
          <div className="mb-4 rounded-2xl border border-border-hairline bg-bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Paste a Link
            </p>
            <input
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              placeholder="https://…"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              className="mt-3 w-full rounded-xl border border-border-hairline bg-bg-primary px-3 py-2 text-[15px] text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              autoFocus
            />
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={busy || picking || !linkDraft.trim()}
              onClick={() => void submitPasteLink()}
            >
              Import
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              disabled={busy || picking}
              onClick={() => setSheetView("menu")}
            >
              Back
            </Button>
          </div>
        ) : sheetView === "paste-text" ? (
          <div className="mb-4 rounded-2xl border border-border-hairline bg-bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Type or Paste Recipe Text
            </p>
            <textarea
              value={pasteDraft}
              onChange={(event) => setPasteDraft(event.target.value)}
              placeholder="Paste the ingredients and steps you copied from a source."
              className="mt-3 min-h-40 w-full resize-y rounded-xl border border-border-hairline bg-bg-primary px-3 py-2 text-[15px] text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              autoFocus
            />
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={busy || picking || !pasteDraft.trim()}
              onClick={() => void submitPasteText()}
            >
              Add recipe
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              disabled={busy || picking}
              onClick={() => setSheetView("menu")}
            >
              Back
            </Button>
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          <CaptureOption
            icon={<Link2 className="h-5 w-5" />}
            label="Paste a Link"
            hint="Recipe websites and blogs import automatically"
            disabled={busy || picking}
            onClick={() => void handlePasteLink()}
          />
          <CaptureOption
            icon={<Type className="h-5 w-5" />}
            label="Type or Paste Recipe Text"
            hint="Ingredients and steps you copied from a source"
            disabled={busy || picking}
            onClick={() => void handlePasteText()}
          />
          <CaptureOption
            icon={<Camera className="h-5 w-5" />}
            label="Scan a Page"
            hint="Cookbook, recipe card, or printed recipe"
            disabled={busy || picking}
            onClick={() => void handleFile("ocr", "camera")}
          />
          <CaptureOption
            icon={<ImageIcon className="h-5 w-5" />}
            label="Photo from Library"
            hint="Screenshots or photos of a recipe, up to 4"
            disabled={busy || picking}
            onClick={() => void handleFile("upload", "library")}
          />
          <CaptureOption
            icon={<FileText className="h-5 w-5" />}
            label="Import a File"
            hint="PDF, text, or markdown document"
            disabled={busy || picking}
            onClick={() => void handleFile("document", "document")}
          />
        </div>
        )}
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

function StatusMark({
  tone,
}: {
  tone: "idle" | "working" | "done" | "attention";
}) {
  if (tone === "working") {
    return (
      <span
        className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-text-secondary/35 border-t-text-primary"
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
        tone === "done"
          ? "bg-accent-success"
          : tone === "attention"
            ? "bg-accent-alert"
            : "bg-text-secondary/45"
      )}
      aria-hidden
    />
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
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-md border border-border-hairline bg-bg-surface px-4 py-3 text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:pointer-events-none disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mt-0.5 shrink-0 text-text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs font-normal leading-snug text-text-secondary">
          {hint}
        </span>
      </span>
    </button>
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
    return "Couldn't add that recipe right now. Try pasting the text or adding a photo.";
  }
  // Never show JSON blobs in the capture sheet
  if (message.includes("{") || message.includes("@type")) {
    return "Couldn't add that recipe right now. Try pasting the text or adding a photo.";
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
