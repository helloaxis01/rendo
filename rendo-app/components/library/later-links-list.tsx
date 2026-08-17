"use client";

import { useState } from "react";
import { Bookmark, ExternalLink, ImageIcon, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteLaterLink,
  faviconUrlForDomain,
} from "@/lib/db/later-links";
import type { LaterLink } from "@/lib/db/types";
import { openExternalUrl } from "@/lib/native/open-url";

export type LaterLinkStart = "paste" | "photo" | "camera";

type Props = {
  links: LaterLink[];
  onExtract: (link: LaterLink, start: LaterLinkStart) => void;
};

export function LaterLinksList({ links, onExtract }: Props) {
  if (!links.length) {
    return (
      <div className="px-4 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] text-center text-sm text-text-secondary">
        Links you save from a share or paste land here. Open the page, then
        paste the text or add a photo.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
      {links.map((link) => (
        <LaterLinkCard key={link.id} link={link} onExtract={onExtract} />
      ))}
    </ul>
  );
}

function LaterLinkCard({
  link,
  onExtract,
}: {
  link: LaterLink;
  onExtract: (link: LaterLink, start: LaterLinkStart) => void;
}) {
  const [iconFailed, setIconFailed] = useState(false);

  async function handleOpen() {
    await openExternalUrl(link.url);
  }

  return (
    <li className="rounded-2xl border border-border-hairline bg-bg-surface p-4">
      <div className="flex items-start gap-3">
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
            {link.domain} · {formatSavedDate(link.created_at)}
          </p>
          <p className="mt-1 truncate text-xs text-text-secondary">{link.url}</p>
        </div>
        <button
          type="button"
          aria-label="Remove saved link"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-bg-muted"
          onClick={() => void deleteLaterLink(link.id)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button type="button" className="w-full" onClick={() => void handleOpen()}>
          <ExternalLink className="h-4 w-4" />
          Open link
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onExtract(link, "paste")}
          >
            <Type className="h-4 w-4" />
            Paste text
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onExtract(link, "photo")}
          >
            <ImageIcon className="h-4 w-4" />
            Add photo
          </Button>
        </div>
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
