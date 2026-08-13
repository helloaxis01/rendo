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

export function listenForIncomingShares() {
  if (!Capacitor.isNativePlatform()) return () => {};

  let lastHandled = "";
  let lastAt = 0;

  const handle = (raw: string) => {
    if (!raw) return;
    const now = Date.now();
    if (raw === lastHandled && now - lastAt < 2500) return;
    const share = parseIncomingShareUrl(raw);
    if (!share || (!share.url && !share.text)) return;
    lastHandled = raw;
    lastAt = now;
    publishIncomingShare(share);
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace("/");
    }
  };

  const pendingListeners = import("@capacitor/app").then(({ App }) => {
    const offUrl = App.addListener("appUrlOpen", ({ url }) => handle(url));
    const offState = App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      void App.getLaunchUrl().then((result) => {
        if (result?.url) handle(result.url);
      });
    });
    void App.getLaunchUrl().then((result) => {
      if (result?.url) handle(result.url);
    });
    return Promise.all([offUrl, offState]);
  });

  return () => {
    void pendingListeners.then((handles) => {
      handles.forEach((handleListener) => handleListener.remove());
    });
  };
}
