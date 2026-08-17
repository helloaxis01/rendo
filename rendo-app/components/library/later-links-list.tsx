"use client";

import { useState } from "react";
import { Bookmark, ExternalLink, RefreshCw, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import {
  deleteLaterLink,
  faviconUrlForDomain,
} from "@/lib/db/later-links";
import type { LaterLink } from "@/lib/db/types";
import { openLaterBrowser } from "@/lib/native/later-browser";
import {
  filesToExtractMedia,
  isImagePickCanceled,
  pickRecipeScreenshots,
} from "@/lib/native/pick-image";

type Props = {
  links: LaterLink[];
  onRetry: (link: LaterLink) => Promise<void>;
  onPasteParse: (link: LaterLink, text: string) => Promise<void>;
  onScreenshots: (
    link: LaterLink,
    media: { mimeType: string; data: string }[]
  ) => Promise<void>;
};

export function LaterLinksList({
  links,
  onRetry,
  onPasteParse,
  onScreenshots,
}: Props) {
  if (!links.length) {
    return (
      <div className="px-4 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] text-center text-sm text-text-secondary">
        Shared links land here when a recipe isn&apos;t ready yet. Retry
        auto-extract anytime, or open the post to paste text or add screenshots.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
      {links.map((link) => (
        <LaterLinkCard
          key={link.id}
          link={link}
          onRetry={onRetry}
          onPasteParse={onPasteParse}
          onScreenshots={onScreenshots}
        />
      ))}
    </ul>
  );
}

function LaterLinkCard({
  link,
  onRetry,
  onPasteParse,
  onScreenshots,
}: {
  link: LaterLink;
  onRetry: (link: LaterLink) => Promise<void>;
  onPasteParse: (link: LaterLink, text: string) => Promise<void>;
  onScreenshots: (
    link: LaterLink,
    media: { mimeType: string; data: string }[]
  ) => Promise<void>;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [webTools, setWebTools] = useState(false);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    setStatus(label);
    try {
      await work();
      setStatus("Saved to your library.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Couldn't extract that recipe."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    await run("Retrying auto-extract…", () => onRetry(link));
  }

  async function handlePaste(text: string) {
    const clipped = text.trim();
    if (!clipped) {
      setStatus("Copy the recipe text, then tap Paste Text & Parse.");
      return;
    }
    await run("Parsing pasted text…", () => onPasteParse(link, clipped));
  }

  async function handleScreenshots() {
    try {
      const files = await pickRecipeScreenshots(4);
      if (!files.length) return;
      const media = await filesToExtractMedia(files);
      if (!media.length) {
        setStatus("Couldn't read those screenshots. Try again.");
        return;
      }
      await run("Reading screenshots…", () => onScreenshots(link, media));
    } catch (error) {
      if (isImagePickCanceled(error)) return;
      setStatus(
        error instanceof Error
          ? error.message
          : "Couldn't read those screenshots. Try again."
      );
    }
  }

  async function handleOpen() {
    setStatus(null);
    const result = await openLaterBrowser(link.url);
    if (result.action === "paste") {
      await handlePaste(result.text);
      return;
    }
    if (result.action === "screenshots") {
      await handleScreenshots();
      return;
    }
    if (result.cancelled && !Capacitor.isNativePlatform()) {
      setWebTools(true);
    }
  }

  return (
    <li className="relative rounded-2xl border border-border-hairline bg-bg-surface p-4">
      <button
        type="button"
        aria-label="Remove saved link"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-muted"
        onClick={() => void deleteLaterLink(link.id)}
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex w-full items-start gap-3 pr-8 text-left"
        disabled={busy}
        onClick={() => void handleOpen()}
      >
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-muted">
          {iconFailed ? (
            <Bookmark className="h-4 w-4 text-text-secondary" />
          ) : (
            <img
              src={faviconUrlForDomain(link.domain)}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
              onError={() => setIconFailed(true)}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-text-primary">
            {link.title || link.domain}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {link.source || link.domain} · {formatSavedDate(link.created_at)}
          </p>
          <p className="mt-1 truncate text-xs text-text-secondary">{link.url}</p>
        </div>
      </button>

      <div className="mt-3 flex flex-col gap-2">
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => void handleRetry()}
        >
          <RefreshCw className="h-4 w-4" />
          Retry Auto-Extract
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void handleOpen()}
        >
          <ExternalLink className="h-4 w-4" />
          Open
        </Button>
        {webTools ? (
          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() =>
                void navigator.clipboard
                  .readText()
                  .then((text) => handlePaste(text))
                  .catch(() => handlePaste(""))
              }
            >
              Paste Text & Parse
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void handleScreenshots()}
            >
              Multi-Screenshot OCR
            </Button>
          </div>
        ) : null}
        {status ? (
          <p className="text-center text-xs text-text-secondary">{status}</p>
        ) : null}
      </div>
    </li>
  );
}

function formatSavedDate(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "Saved";
  const delta = Date.now() - at;
  if (delta < 60_000) return "Just now";
  if (delta < 60 * 60_000) {
    const minutes = Math.max(1, Math.round(delta / 60_000));
    return `${minutes}m ago`;
  }
  if (delta < 24 * 60 * 60_000) {
    const hours = Math.max(1, Math.round(delta / (60 * 60_000)));
    return `${hours}h ago`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(at));
}
