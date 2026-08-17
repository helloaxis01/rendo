"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Camera,
  ImageIcon,
  Images,
  FileText,
  Link2,
  Type,
  X,
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
import {
  filesFromShareImages,
  type IncomingShare,
} from "@/lib/native/incoming-share";
import {
  isSocialPostUrl,
  logInstagramShare,
  SOCIAL_USE_SCREENSHOTS_MESSAGE,
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
} from "@/lib/native/pick-image";
import {
  isRetryableExtractFailure,
  publicImportError,
} from "@/lib/capture/import-errors";
import { prepareFile, type MediaPayload } from "@/lib/capture/prepare-media";
import { assertPhotosUsableForExtract } from "@/lib/capture/image-quality";
import { postExtract } from "@/lib/capture/post-extract";
import { visionBatchRequest } from "@/lib/capture/vision-batch";
import {
  appendPhotoSession,
  clearPhotoSession,
  getPhotoSession,
  MAX_SESSION_PHOTOS,
  removePhotoSessionAt,
  subscribePhotoSession,
} from "@/lib/capture/photo-session";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (recipes: Recipe[]) => void;
  incomingShare?: IncomingShare | null;
};

type ExtractType = "url" | "ocr" | "upload" | "document" | "text" | "html";
type SheetView =
  | "menu"
  | "paste-text"
  | "paste-link"
  | "photo"
  | "screenshots"
  | "camera";
type PhotoSession = "screenshots" | "camera";

const DEBUG_SHARE = false;
const READY_STATUS = "Add your recipe now.";
const EXTRACTING_STATUS = "Adding your recipe…";
const PROCESS_STATUS = "Processing recipe…";
const PREPARE_STATUS = "Preparing photos…";
const CAPTION_GRACE_MS = 1200;

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
  const [sheetView, setSheetView] = useState<SheetView>("menu");
  const [pasteDraft, setPasteDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [clipboardLinkUrl, setClipboardLinkUrl] = useState<string | null>(null);
  const [clipboardLinkPreview, setClipboardLinkPreview] = useState<string | null>(
    null
  );
  const [clipboardLinkReady, setClipboardLinkReady] = useState(false);
  const pendingPhotos = useSyncExternalStore(
    subscribePhotoSession,
    getPhotoSession,
    getPhotoSession
  );
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
  const screenshotSessionRef = useRef<PhotoSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clipboardClipRef = useRef<string | null>(null);
  const clipboardReadForOpenRef = useRef(false);

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
    clearPhotoSession();
    screenshotSessionRef.current = null;
    clipboardClipRef.current = null;
    clipboardReadForOpenRef.current = false;
    setClipboardLinkUrl(null);
    setClipboardLinkPreview(null);
    setClipboardLinkReady(false);
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
    setStatus(media ? PROCESS_STATUS : EXTRACTING_STATUS);
    patchShareDebug({ path: `extract:${type}`, result: "working" });
    try {
      let posted: Awaited<ReturnType<typeof postExtract>> | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          posted = await postExtract(
            media
              ? visionBatchRequest({ type, payload, media })
              : { type, payload, media: null },
            controller.signal
          );
          break;
        } catch (err) {
          if (isAbortError(err)) return;
          if (attempt === 0 && isRetryableExtractFailure(err)) continue;
          throw err;
        }
      }
      if (!posted) throw new Error("Couldn't add that recipe");
      const data = posted.data;
      if (!posted.ok) {
        throw new Error(
          publicImportError(data.error || "Extract failed", importKind(type))
        );
      }

      if (isRequiresManualInput(data)) {
        const sourceUrl =
          payload.match(/https?:\/\/\S+/i)?.[0] ?? captionPromptUrl ?? "";
        await handleMissingSource(sourceUrl, data.message);
        return;
      }

      const recipes = data.recipes as Recipe[];
      if (!recipes?.length) {
        const warning = publicImportError(
          data.warning ||
            (type === "upload" || type === "ocr"
              ? "Text unreadable, try a clearer photo."
              : "No recipes found in that source. Try pasting the recipe text."),
          importKind(type)
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
      const extra = publicImportError(data.warning || "");
      setImportPhase("done");
      const saved = `Saved ${recipes.length} recipe${
        recipes.length === 1 ? "" : "s"
      }${extra ? ` — ${extra}` : data.mode === "mock" ? " (offline stub)" : ""}.`;
      setStatus(saved);
      patchShareDebug({ result: saved });
      onImported?.(recipes);
      clearPhotoSession();
      setTimeout(() => onOpenChange(false), 900);
    } catch (err) {
      if (isAbortError(err)) return;
      setImportPhase("error");
      const message = publicImportError(
        err instanceof Error
          ? err.message
          : type === "upload" || type === "ocr"
            ? "Text unreadable, try a clearer photo."
            : "Couldn't add that recipe",
        importKind(type)
      );
      setStatus(message);
      patchShareDebug({ result: message });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function handleMissingSource(url: string, message?: string) {
    if (isSocialPostUrl(url)) {
      guideSocialScreenshots();
      return;
    }
    askForMoreInput(url, message);
  }

  function guideSocialScreenshots(message = SOCIAL_USE_SCREENSHOTS_MESSAGE) {
    clearCaptionWait();
    setCaptionPromptUrl(null);
    setBusy(false);
    setImportPhase("idle");
    setStatus(message);
    screenshotSessionRef.current = "screenshots";
    setSheetView("screenshots");
    patchShareDebug({
      path: "use-screenshots",
      result: message,
    });
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

  function openPasteLinkFromClipboard(url: string) {
    setLinkDraft(url);
    setSheetView("paste-link");
  }

  async function readClipboardOnce() {
    if (clipboardReadForOpenRef.current) return clipboardClipRef.current ?? "";
    clipboardReadForOpenRef.current = true;
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      clipboardClipRef.current = clip;
      return clip;
    } catch {
      clipboardClipRef.current = "";
      return "";
    }
  }

  async function openPasteTextTab() {
    const clip = await readClipboardOnce();
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
    if (plan.kind === "use-screenshots") {
      guideSocialScreenshots();
      return;
    }
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
        const extra = publicImportError(data.warning || "");
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
      if (isRequiresManualInput(data) || isSocialPostUrl(url)) {
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
    if (plan.kind === "extract-images") {
      interceptSharedScreenshots(share);
      return;
    }
    if (plan.kind === "use-screenshots") {
      guideSocialScreenshots();
      return;
    }
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

  function interceptSharedScreenshots(share: IncomingShare) {
    clearCaptionWait();
    screenshotSessionRef.current = "screenshots";
    setSheetView("screenshots");
    setImportPhase("idle");
    const files = share.images?.length
      ? filesFromShareImages(share.images)
      : [];
    if (files.length) {
      appendPhotoSession(files);
      const total = getPhotoSession().length;
      setStatus(
        `${total} screenshot${
          total === 1 ? "" : "s"
        } from Share. Review, then Process Recipe.`
      );
      return;
    }
    setStatus("Opening shared screenshots…");
  }

  useEffect(() => {
    if (!open || incomingShare) return;
    if (getPhotoSession().length === 0) return;
    screenshotSessionRef.current ??= "screenshots";
    setSheetView(screenshotSessionRef.current);
  }, [open, incomingShare]);

  useEffect(() => {
    if (!open) {
      clipboardClipRef.current = null;
      clipboardReadForOpenRef.current = false;
      setClipboardLinkUrl(null);
      setClipboardLinkPreview(null);
      setClipboardLinkReady(false);
      return;
    }
    if (incomingShare) {
      setClipboardLinkUrl(null);
      setClipboardLinkPreview(null);
      setClipboardLinkReady(false);
      return;
    }
    setClipboardLinkUrl(null);
    setClipboardLinkPreview(null);
    setClipboardLinkReady(false);
    const controller = new AbortController();
    void (async () => {
      const clip = await readClipboardOnce();
      const url = extractClipboardUrl(clip);
      if (controller.signal.aborted) return;
      setClipboardLinkReady(true);
      if (!url || isSocialPostUrl(url)) return;
      setClipboardLinkUrl(url);
      setClipboardLinkPreview(clipboardUrlDomain(url));
      const title = await fetchCheapPageTitle(url, controller.signal);
      if (!controller.signal.aborted && title) {
        setClipboardLinkPreview(title);
      }
    })();
    return () => controller.abort();
  }, [open, incomingShare]);

  useEffect(() => {
    if (!open || !incomingShare) return;
    latestShareRef.current = incomingShare;
    const url = incomingShare.url?.trim() || "";
    const text = incomingShare.text?.trim() || "";
    const imageBytes = incomingShare.images?.length ?? 0;
    const imageCount = incomingShare.imageCount ?? 0;
    logInstagramShare("capture-receipt", incomingShare);
    patchShareDebug({ url, text });
    const imageSig =
      incomingShare.images?.[incomingShare.images.length - 1]?.slice(-32) ?? "";
    const key = `${url}|${text}|img:${imageBytes}|n:${imageCount}|${imageSig}`;
    if (!url && !text && !imageBytes && !imageCount) return;
    if (ingestedShareKey.current === key) return;
    if (
      !imageBytes &&
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

    if (plan.kind === "use-screenshots") {
      guideSocialScreenshots();
      return;
    }

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
    const clip = await readClipboardOnce();
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
    if (isSocialPostUrl(url)) {
      setSheetView("menu");
      guideSocialScreenshots();
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
      if (type !== "document") {
        await assertPhotosUsableForExtract([file]);
      }
      const prepared = await prepareFile(file, type !== "document", 1);
      const sourceUrl = captionPromptUrl ?? "";
      await runExtract(
        type,
        sourceUrl
          ? `Source URL: ${sourceUrl}\n\n${prepared.payload}`.slice(0, 40000)
          : prepared.payload,
        prepared.media
      );
    } catch (err) {
      setStatus(
        publicImportError(
          err instanceof Error ? err.message : "Couldn’t read that file",
          "photo"
        )
      );
      setBusy(false);
    }
  }

  async function readPickedImages(files: File[]) {
    const images = files.slice(0, MAX_SESSION_PHOTOS);
    if (!images.length) return;
    try {
      setBusy(true);
      setImportPhase("extracting");
      setStatus(PREPARE_STATUS);
      await assertPhotosUsableForExtract(images);
      const media: MediaPayload[] = [];
      for (const file of images) {
        const prepared = await prepareFile(file, true, images.length);
        if (prepared.media) media.push(prepared.media);
      }
      if (!media.length) {
        throw new Error("Couldn't read those photos. Try again.");
      }
      const sourceUrl = captionPromptUrl ?? "";
      const payload = sourceUrl
        ? `Source URL: ${sourceUrl}\nIMAGE FILES: ${media.length} screenshot(s)`
        : `IMAGE FILES: ${media.length} screenshot(s)`;
      setStatus(PROCESS_STATUS);
      await runExtract("upload", payload, media);
    } catch (err) {
      if (isAbortError(err)) return;
      setImportPhase("error");
      setStatus(
        publicImportError(
          err instanceof Error ? err.message : "Couldn’t read that file",
          "photo"
        )
      );
      setBusy(false);
    }
  }

  async function addPhotoToSession(source: PhotoSession) {
    screenshotSessionRef.current = source;
    setSheetView(source);
    const via = source === "camera" ? "camera" : "library";
    if (canUseNativeCamera()) {
      nativePickRef.current = true;
      setPicking(true);
      setStatus(via === "camera" ? "Opening camera…" : "Opening photo library…");
      try {
        const file = await pickNativeImage(via);
        appendPhotoSession(file);
        setImportPhase("idle");
        setStatus(null);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          setStatus(
            publicImportError(
              err instanceof Error
                ? err.message
                : via === "camera"
                  ? "Couldn’t open the camera"
                  : "Couldn’t open the photo library",
              "photo"
            )
          );
        } else if (!pendingPhotos.length) {
          setStatus(null);
        }
      } finally {
        nativePickRef.current = false;
        setPicking(false);
      }
      return;
    }
    const input =
      via === "camera" ? cameraInputRef.current : libraryInputRef.current;
    if (!input) return;
    nativePickRef.current = false;
    setPicking(true);
    input.value = "";
    input.click();
  }

  async function openPhotoSession(source: PhotoSession) {
    screenshotSessionRef.current = source;
    setSheetView(source);
    if (pendingPhotos.length) return;
    await addPhotoToSession(source);
  }

  async function handleFile(
    type: "upload" | "document" | "ocr",
    via: "camera" | "library" | "document"
  ) {
    screenshotSessionRef.current = null;
    if (via === "library" && canUseNativeCamera()) {
      nativePickRef.current = true;
      setPicking(true);
      setStatus("Opening photo library…");
      try {
        const file = await pickNativeImage("library");
        await readPickedFile("upload", file);
      } catch (err) {
        if (!isImagePickCanceled(err)) {
          setStatus(
            publicImportError(
              err instanceof Error
                ? err.message
                : "Couldn’t open the photo library",
              "photo"
            )
          );
        } else {
          setStatus(null);
        }
        setBusy(false);
      } finally {
        nativePickRef.current = false;
        setPicking(false);
      }
      return;
    }

    if (via === "camera" && canUseNativeCamera()) {
      nativePickRef.current = true;
      setPicking(true);
      setStatus("Opening camera…");
      try {
        const file = await pickNativeImage("camera");
        await readPickedFile(type, file);
        return;
      } catch (err) {
        if (isImagePickCanceled(err)) {
          setStatus(null);
          return;
        }
      } finally {
        nativePickRef.current = false;
        setPicking(false);
      }
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

  const statusMarkTone =
    importPhase === "waiting" ||
    importPhase === "extracting" ||
    busy
      ? "working"
      : importPhase === "done"
        ? "done"
        : importPhase === "error" || importPhase === "needs-input"
          ? "attention"
          : "idle";

  const statusLabel =
    importPhase === "waiting"
      ? "Waiting"
      : importPhase === "needs-input"
        ? "Needs more"
        : importPhase === "extracting" || busy
          ? sheetView === "screenshots" || sheetView === "camera"
            ? "Processing"
            : "Adding"
          : importPhase === "done"
            ? "Saved"
            : importPhase === "error"
              ? "Couldn't add"
              : "Ready";

  const statusMessage = busy
    ? sheetView === "screenshots" || sheetView === "camera"
      ? status || PROCESS_STATUS
      : EXTRACTING_STATUS
    : status ||
      (pendingPhotos.length &&
      (sheetView === "screenshots" || sheetView === "camera")
        ? `${pendingPhotos.length} of ${MAX_SESSION_PHOTOS} captured. Process Recipe when you’re ready.`
        : READY_STATUS);

  const isQuietReady =
    importPhase === "idle" && !busy && !status && sheetView === "menu";

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
          if (screenshotSessionRef.current === "camera" && file) {
            setSheetView("camera");
            appendPhotoSession(file);
            return;
          }
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
          if (screenshotSessionRef.current === "screenshots") {
            setSheetView("screenshots");
            appendPhotoSession(files);
            return;
          }
          const file = files[0];
          if (file) void readPickedFile("upload", file);
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
            However you found it — a link, a screenshot, a scan, a memory — it
            goes here.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            isQuietReady
              ? "mb-3 border-b border-border-hairline pb-3"
              : cn(
                  "mb-4 rounded-2xl border px-3.5 py-3",
                  importPhase === "error" || importPhase === "needs-input"
                    ? "border-accent-alert/35 bg-accent-alert/[0.06]"
                    : importPhase === "done"
                      ? "border-accent-success/35 bg-accent-success/[0.06]"
                      : "border-border-hairline border-l-[3px] border-l-text-primary bg-bg-muted/40"
                )
          )}
          role="status"
          aria-live="polite"
        >
          {isQuietReady ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {statusLabel}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-text-secondary">
                {statusMessage}
              </p>
            </>
          ) : (
          <div className="flex items-start gap-3">
            <StatusMark tone={statusMarkTone} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                {statusLabel}
              </p>
              <p className="mt-1 text-[14px] leading-snug text-text-primary">
                {statusMessage}
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
                    onClick={() => setSheetView("photo")}
                  >
                    From a Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy || picking}
                    onClick={() => void handleFile("document", "document")}
                  >
                    Import a File
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
          )}
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
        ) : sheetView === "screenshots" || sheetView === "camera" ? (
          <PhotoSessionPanel
            mode={sheetView}
            files={pendingPhotos}
            busy={busy}
            picking={picking}
            error={importPhase === "error" ? status : null}
            onAdd={() => void addPhotoToSession(sheetView)}
            onProcess={() => void readPickedImages(pendingPhotos)}
            onRemove={(index) => removePhotoSessionAt(index)}
            onClear={() => clearPhotoSession()}
            onBack={() => {
              screenshotSessionRef.current = null;
              setSheetView("photo");
            }}
          />
        ) : sheetView === "photo" ? (
          <div className="flex flex-col gap-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              From a Photo
            </p>
            <CaptureOption
              icon={<Images className="h-5 w-5" />}
              label="Screenshots"
              hint={
                pendingPhotos.length
                  ? `${pendingPhotos.length} of 4 in this session`
                  : "Instagram, TikTok, cookbook — several shots in order"
              }
              disabled={busy || picking}
              onClick={() => void openPhotoSession("screenshots")}
            />
            <CaptureOption
              icon={<Camera className="h-5 w-5" />}
              label="Take Photos"
              hint={
                pendingPhotos.length
                  ? `${pendingPhotos.length} of 4 in this session`
                  : "Cookbook, card, or anything in front of you"
              }
              disabled={busy || picking}
              onClick={() => void openPhotoSession("camera")}
            />
            <CaptureOption
              icon={<ImageIcon className="h-5 w-5" />}
              label="Photo from Library"
              hint="One still from your camera roll"
              disabled={busy || picking}
              onClick={() => void handleFile("upload", "library")}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-1 w-full"
              disabled={busy || picking}
              onClick={() => setSheetView("menu")}
            >
              Back
            </Button>
          </div>
        ) : (
        <>
          {sheetView === "menu" && importPhase !== "needs-input" ? (
            <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Import via
            </p>
          ) : null}
        <div className="flex flex-col gap-2">
          {clipboardLinkReady &&
          clipboardLinkUrl &&
          !busy &&
          importPhase === "idle" ? (
            <CaptureOption
              priority
              icon={<Link2 className="h-5 w-5" />}
              label="Paste link from clipboard?"
              hint={clipboardLinkPreview ?? clipboardUrlDomain(clipboardLinkUrl)}
              disabled={busy || picking}
              onClick={() => openPasteLinkFromClipboard(clipboardLinkUrl)}
            />
          ) : null}
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
            icon={<Images className="h-5 w-5" />}
            label="From a Photo"
            hint={
              pendingPhotos.length
                ? `${pendingPhotos.length} of 4 in this session`
                : "Best for Instagram, TikTok, and cookbook pages"
            }
            disabled={busy || picking}
            onClick={() => setSheetView("photo")}
          />
          <CaptureOption
            icon={<FileText className="h-5 w-5" />}
            label="Import a File"
            hint="PDF, text, or markdown document"
            disabled={busy || picking}
            onClick={() => void handleFile("document", "document")}
          />
          <CaptureShareSheetTip />
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

function PhotoSessionPanel({
  mode,
  files,
  busy,
  picking,
  error,
  onAdd,
  onProcess,
  onRemove,
  onClear,
  onBack,
}: {
  mode: PhotoSession;
  files: File[];
  busy: boolean;
  picking: boolean;
  error?: string | null;
  onAdd: () => void;
  onProcess: () => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onBack: () => void;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const isCamera = mode === "camera";
  const units = isCamera ? "photos" : "screenshots";
  const previewFile =
    previewIndex != null ? files[previewIndex] ?? null : null;

  function removeFrame(index: number) {
    const nextLength = files.length - 1;
    onRemove(index);
    setPreviewIndex((current) => {
      if (current == null) return null;
      if (nextLength <= 0) return null;
      if (index < current) return current - 1;
      if (index === current) return Math.min(current, nextLength - 1);
      return current;
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-border-hairline bg-bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {isCamera ? "Take Photos" : "Screenshot a Recipe"}
      </p>
      <p className="mt-2 text-[14px] leading-snug text-text-secondary">
        {isCamera
          ? "Shoot the page in order — ingredients, then method. Up to 4."
          : "Add shots in order — ingredients, then method. Up to 4."}
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium text-text-primary">
          {files.length} of {MAX_SESSION_PHOTOS} captured
        </p>
        <p className="text-[12px] text-text-secondary">
          Tap a frame to preview
        </p>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: MAX_SESSION_PHOTOS }, (_, index) => {
          const file = files[index];
          if (!file) {
            return (
              <div
                key={`empty-${index}`}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-hairline bg-bg-muted/50 text-[11px] font-medium text-text-secondary"
                aria-label={`Empty slot ${index + 1} of ${MAX_SESSION_PHOTOS}`}
              >
                {index + 1}
              </div>
            );
          }
          return (
            <ScreenshotThumb
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              file={file}
              index={index}
              selected={previewIndex === index}
              disabled={busy || picking}
              onPreview={() => setPreviewIndex(index)}
              onRemove={() => removeFrame(index)}
            />
          );
        })}
      </div>

      {previewFile && previewIndex != null ? (
        <FramePreview
          file={previewFile}
          index={previewIndex}
          total={files.length}
          disabled={busy || picking}
          onClose={() => setPreviewIndex(null)}
          onRemove={() => removeFrame(previewIndex)}
        />
      ) : null}

      {error ? (
        <div
          className="mt-3 rounded-xl border border-accent-alert/40 bg-accent-alert/10 px-3 py-3"
          role="alert"
        >
          <p className="text-[14px] font-medium text-text-primary">{error}</p>
          <p className="mt-1 text-[13px] leading-snug text-text-secondary">
            Add a clearer shot, or paste the recipe text.
          </p>
        </div>
      ) : null}

      {busy ? (
        <div
          className="mt-3 flex items-start gap-3 rounded-xl border border-border-hairline bg-bg-muted/70 px-3 py-3"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-text-secondary/35 border-t-text-primary"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-text-primary">
              Processing recipe…
            </p>
            <p className="mt-1 text-[13px] leading-snug text-text-secondary">
              Sending {files.length} frame{files.length === 1 ? "" : "s"} to
              extract ingredients and steps. This can take a little while.
            </p>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        className="mt-3 w-full"
        disabled={busy || picking || files.length === 0}
        onClick={onProcess}
        aria-busy={busy}
      >
        {busy ? (
          <>
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-bg-primary/35 border-t-bg-primary"
              aria-hidden
            />
            Processing recipe…
          </>
        ) : (
          "Process Recipe"
        )}
      </Button>
      {files.length < MAX_SESSION_PHOTOS ? (
        <Button
          type="button"
          variant={files.length ? "outline" : "default"}
          className={files.length ? "mt-2 w-full" : "mt-3 w-full"}
          disabled={busy || picking}
          onClick={onAdd}
        >
          {files.length
            ? isCamera
              ? "Take another photo"
              : "Add another screenshot"
            : isCamera
              ? "Take first photo"
              : "Add first screenshot"}
        </Button>
      ) : null}
      {files.length ? (
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full"
          disabled={busy || picking}
          onClick={() => {
            setPreviewIndex(null);
            onClear();
          }}
        >
          Clear {units}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full"
        disabled={busy || picking}
        onClick={onBack}
      >
        Back
      </Button>
    </div>
  );
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

function ScreenshotThumb({
  file,
  index,
  selected,
  disabled,
  onPreview,
  onRemove,
}: {
  file: File;
  index: number;
  selected: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="relative h-16 w-16 shrink-0">
      <button
        type="button"
        className={cn(
          "h-16 w-16 overflow-hidden rounded-lg border bg-bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
          selected ? "border-text-primary" : "border-border-hairline"
        )}
        disabled={disabled}
        onClick={onPreview}
        aria-label={`Preview frame ${index + 1}`}
        aria-pressed={selected}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
        <span className="absolute bottom-1 left-1 rounded bg-bg-primary/85 px-1 text-[10px] font-medium text-text-primary">
          {index + 1}
        </span>
      </button>
      <button
        type="button"
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border-hairline bg-bg-surface text-text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:opacity-40"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Delete frame ${index + 1}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function FramePreview({
  file,
  index,
  total,
  disabled,
  onClose,
  onRemove,
}: {
  file: File;
  index: number;
  total: number;
  disabled?: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border-hairline bg-bg-muted">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-secondary">
          Frame {index + 1} of {total}
        </p>
        <button
          type="button"
          className="text-[13px] font-medium text-text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          onClick={onClose}
        >
          Close preview
        </button>
      </div>
      <div className="bg-black/80">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Frame ${index + 1} preview`}
            className="mx-auto max-h-64 w-full object-contain"
          />
        ) : null}
      </div>
      <div className="p-3">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled}
          onClick={onRemove}
        >
          Delete this frame
        </Button>
      </div>
    </div>
  );
}

function extractClipboardUrl(text: string): string | null {
  if (!text.trim()) return null;
  const match = text.match(/https?:\/\/\S+/i);
  if (!match) return null;
  const raw = match[0].replace(/[),.;>\]"']+$/, "");
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return raw;
  } catch {
    return null;
  }
}

function clipboardUrlDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function fetchCheapPageTitle(
  url: string,
  signal: AbortSignal
): Promise<string | null> {
  if (isSocialPostUrl(url)) return null;
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 2500);
  const cancel = () => timeoutController.abort();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: timeoutController.signal,
      headers: { Accept: "text/plain,*/*" },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    const firstLine =
      text
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "";
    const title = firstLine.replace(/^title:\s*/i, "").trim();
    if (title.length < 4 || title.length > 72) return null;
    if (/^https?:\/\//i.test(title)) return null;
    return title;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", cancel);
  }
}

function CaptureShareSheetTip() {
  return (
    <p
      role="note"
      className="pointer-events-none select-none border-t border-border-hairline pt-3 text-xs font-normal leading-relaxed text-text-secondary"
    >
      From Instagram or TikTok: screenshot the post (ingredients, then steps) and
      add up to 4 shots under From a Photo.
    </p>
  );
}

function CaptureOption({
  icon,
  label,
  hint,
  onClick,
  disabled,
  priority,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  priority?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:pointer-events-none disabled:opacity-40",
        priority
          ? "rounded-2xl border-2 border-text-primary bg-bg-surface py-3.5"
          : "rounded-md border border-border-hairline bg-bg-surface"
      )}
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

function importKind(type: ExtractType): "photo" | "general" {
  return type === "upload" || type === "ocr" ? "photo" : "general";
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function fetchRecipePageInBrowser(
  url: string
): Promise<{ kind: "html" | "text"; body: string } | null> {
  if (isSocialPostUrl(url)) return null;

  async function timedFetch(input: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const attempts: Array<() => Promise<{ kind: "html" | "text"; body: string } | null>> =
    [
      async () => {
        const res = await timedFetch(
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
        const res = await timedFetch(
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
        const res = await timedFetch(`https://r.jina.ai/${url}`, {
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
