import { Capacitor } from "@capacitor/core";
import {
  hasUsableInstagramCaption,
  isInstagramUrl,
  mergeIncomingShares,
} from "@/lib/extract/instagram";

export type IncomingShare = {
  url?: string;
  text?: string;
};

const EVENT = "rendo:incoming-share";

let pending: IncomingShare | null = null;

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
    if (sharedUrl || text) return { url: sharedUrl, text };
  } catch {
    // Fall through to manual parse when the nested Instagram URL is malformed.
  }
  const urlMatch = raw.match(/[?&]url=([^&]*)/i);
  const textMatch = raw.match(/[?&]text=([^&]*)/i);
  const sharedUrl = urlMatch
    ? decodeURIComponent(urlMatch[1].replace(/\+/g, "%20")).trim()
    : undefined;
  const text = textMatch
    ? decodeURIComponent(textMatch[1].replace(/\+/g, "%20")).trim()
    : undefined;
  if (!sharedUrl && !text) return null;
  return { url: sharedUrl, text };
}

export function publishIncomingShare(share: IncomingShare) {
  pending = mergeIncomingShares(pending, share);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pending }));
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
    const share = takePendingShare() ?? custom.detail ?? null;
    if (share && (share.url || share.text)) listener(share);
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

export function listenForIncomingShares() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const handle = (raw: string) => {
    if (!raw) return;
    const share = parseIncomingShareUrl(raw);
    if (!share || (!share.url && !share.text)) return;
    if (wasShareHandled(raw)) return;
    rememberHandledShare(raw);
    const combined = `${share.text ?? ""}\n${share.url ?? ""}`;
    if (
      share.url &&
      isInstagramUrl(share.url) &&
      !hasUsableInstagramCaption(combined)
    ) {
      window.setTimeout(() => publishIncomingShare(share), 1600);
      return;
    }
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
