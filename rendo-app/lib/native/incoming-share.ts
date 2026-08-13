import { Capacitor } from "@capacitor/core";

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
    return false;
  }
}

export function parseIncomingShareUrl(raw: string): IncomingShare | null {
  if (!isIncomingShareUrl(raw)) return null;
  try {
    const url = new URL(raw);
    const sharedUrl = url.searchParams.get("url")?.trim() || undefined;
    const text = url.searchParams.get("text")?.trim() || undefined;
    return { url: sharedUrl, text };
  } catch {
    return null;
  }
}

export function publishIncomingShare(share: IncomingShare) {
  pending = share;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: share }));
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
    const share = takePendingShare() ?? (event as CustomEvent<IncomingShare>).detail;
    if (share) listener(share);
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
    // Capacitor keeps getLaunchUrl() as the original share for the whole
    // process. Re-reading it on every resume re-imports the same Instagram post.
    if (wasShareHandled(raw)) return;
    rememberHandledShare(raw);
    publishIncomingShare(share);
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace("/");
    }
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
