import type { Recipe } from "@/lib/db/types";
import { Capacitor } from "@capacitor/core";
import {
  logInstagramShare,
  mergeIncomingShares,
} from "@/lib/extract/instagram";
import { dataUrlToFile } from "@/lib/native/pick-image";

const DEBUG_SHARE = false;

export type IncomingShare = {
  url?: string;
  text?: string;
  /** JPEG/PNG base64 or data URLs from the iOS Share Extension. */
  images?: string[];
  /** Count from the deep link before pasteboard images arrive. */
  imageCount?: number;
  silent?: boolean;
  later?: boolean;
  notified?: boolean;
  recipes?: Recipe[];
};

const EVENT = "rendo:incoming-share";

let pending: IncomingShare | null = null;
/** Kept after takePendingShare so a late caption can still merge. */
let lastShare: IncomingShare | null = null;

export function isIncomingShareUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === "rendo:") {
      return url.hostname === "capture" || url.pathname.includes("capture");
    }
    return url.pathname === "/capture" || url.pathname.startsWith("/capture/");
  } catch {
    return /rendo:\/\/capture/i.test(raw);
  }
}

export function parseIncomingShareUrl(raw: string): IncomingShare | null {
  if (!isIncomingShareUrl(raw)) return null;
  try {
    const url = new URL(raw);
    const sharedUrl = url.searchParams.get("url")?.trim() || undefined;
    const text = url.searchParams.get("text")?.trim() || undefined;
    const imageCountRaw = url.searchParams.get("images")?.trim();
    const imageCount = imageCountRaw ? Number(imageCountRaw) || undefined : undefined;
    if (sharedUrl || text || imageCount) {
      return { url: sharedUrl, text, imageCount };
    }
  } catch {
    // Fall through to manual parse when the nested Instagram URL is malformed.
  }
  const urlMatch = raw.match(/[?&]url=([^&]*)/i);
  const textMatch = raw.match(/[?&]text=([^&]*)/i);
  const imagesMatch = raw.match(/[?&]images=([^&]*)/i);
  const sharedUrl = urlMatch
    ? decodeURIComponent(urlMatch[1].replace(/\+/g, "%20")).trim()
    : undefined;
  const text = textMatch
    ? decodeURIComponent(textMatch[1].replace(/\+/g, "%20")).trim()
    : undefined;
  const imageCount = imagesMatch
    ? Number(decodeURIComponent(imagesMatch[1])) || undefined
    : undefined;
  if (!sharedUrl && !text && !imageCount) return null;
  return { url: sharedUrl, text, imageCount };
}

export function publishIncomingShare(share: IncomingShare) {
  logInstagramShare("receipt", share);
  const merged = mergeIncomingShares(lastShare, share);
  lastShare = merged;
  pending = merged;
  logInstagramShare("after-merge", merged);
  if (typeof window === "undefined") return;
  if (DEBUG_SHARE) {
    window.dispatchEvent(
      new CustomEvent("rendo:share-debug", {
        detail: {
          stage: "incoming-share",
          url: merged.url ?? "",
          text: merged.text ?? "",
        },
      })
    );
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: merged }));
}

export function hasShareImages(share: IncomingShare | null | undefined): boolean {
  if (!share) return false;
  return Boolean(share.images?.length || (share.imageCount && share.imageCount > 0));
}

export function filesFromShareImages(images: string[]): File[] {
  return images.slice(0, 4).map((raw, index) => {
    const dataUrl = raw.startsWith("data:")
      ? raw
      : `data:image/jpeg;base64,${raw}`;
    return dataUrlToFile(dataUrl, `share-${index + 1}.jpg`);
  });
}

export function takePendingShare(): IncomingShare | null {
  const next = pending;
  pending = null;
  return next;
}

export function subscribeIncomingShare(
  listener: (share: IncomingShare) => void
) {
  if (typeof window === "undefined") return () => {};
  const onEvent = (event: Event) => {
    const custom = event as CustomEvent<IncomingShare>;
    const share = takePendingShare() ?? custom.detail ?? lastShare;
    if (share && (share.url || share.text || share.recipes?.length || hasShareImages(share))) {
      listener(share);
    }
  };
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}

const HANDLED_SHARE_KEY = "rendo.handledShareUrl";

function rememberHandledShare(raw: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(HANDLED_SHARE_KEY, raw);
  } catch {
    // private mode
  }
}

function wasShareHandled(raw: string) {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(HANDLED_SHARE_KEY) === raw;
  } catch {
    return false;
  }
}

export function installShareBridge() {
  if (typeof window === "undefined") return;
  (
    window as Window & {
      __rendoPublishShare?: (share: IncomingShare) => void;
    }
  ).__rendoPublishShare = (share) => {
    if (share && (share.url || share.text || share.recipes?.length || hasShareImages(share))) {
      publishIncomingShare(share);
    }
  };
}

export function listenForIncomingShares() {
  installShareBridge();
  if (!Capacitor.isNativePlatform()) return () => {};

  const handle = (raw: string) => {
    if (!raw) return;
    const share = parseIncomingShareUrl(raw);
    if (!share || (!share.url && !share.text && !hasShareImages(share))) return;
    logInstagramShare("appUrlOpen", share, { rawLength: raw.length });
    if (wasShareHandled(raw)) return;
    rememberHandledShare(raw);
    publishIncomingShare(share);
  };

  const pendingListeners = import("@capacitor/app").then(({ App }) => {
    const offUrl = App.addListener("appUrlOpen", ({ url }) => handle(url));
    void App.getLaunchUrl().then((result) => {
      if (result?.url) handle(result.url);
    });
    return Promise.all([offUrl]);
  });

  return () => {
    void pendingListeners.then((handles) => {
      handles.forEach((handleListener) => handleListener.remove());
    });
  };
}
