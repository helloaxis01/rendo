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
    if (!sharedUrl && !text) return null;
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
    if (share?.url || share?.text) listener(share);
  };
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}

export function listenForIncomingShares() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const handle = (raw: string) => {
    const share = parseIncomingShareUrl(raw);
    if (!share) return;
    publishIncomingShare(share);
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace("/");
    }
  };

  void import("@capacitor/app").then(({ App }) => {
    void App.getLaunchUrl().then((result) => {
      if (result?.url) handle(result.url);
    });
  });

  const pendingListener = import("@capacitor/app").then(({ App }) =>
    App.addListener("appUrlOpen", ({ url }) => handle(url))
  );

  return () => {
    void pendingListener.then((handleListener) => handleListener.remove());
  };
}
