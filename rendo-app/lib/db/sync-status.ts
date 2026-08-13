"use client";

export type CloudSyncState = "idle" | "syncing" | "ok" | "error";

export type CloudSyncStatus = {
  state: CloudSyncState;
  message: string;
  lastOkAt: string | null;
  lastCount: number | null;
};

const STORAGE_KEY = "rendo_cloud_sync_status_v1";
const listeners = new Set<() => void>();

const DEFAULT_STATUS: CloudSyncStatus = {
  state: "idle",
  message: "",
  lastOkAt: null,
  lastCount: null,
};

let current: CloudSyncStatus = DEFAULT_STATUS;
let didHydrate = false;

function load(): CloudSyncStatus {
  if (typeof window === "undefined") {
    return DEFAULT_STATUS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STATUS;
    }
    const parsed = JSON.parse(raw) as CloudSyncStatus;
    return {
      state: parsed.state === "syncing" ? "idle" : parsed.state ?? "idle",
      message: parsed.message ?? "",
      lastOkAt: parsed.lastOkAt ?? null,
      lastCount: parsed.lastCount ?? null,
    };
  } catch {
    return DEFAULT_STATUS;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore quota
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return current;
}

export function getServerCloudSyncStatus(): CloudSyncStatus {
  return DEFAULT_STATUS;
}

/** Read persisted status after mount so hydration does not setState early. */
export function hydrateCloudSyncStatusFromStorage() {
  if (didHydrate || typeof window === "undefined") return;
  didHydrate = true;
  const loaded = load();
  if (
    loaded.state === current.state &&
    loaded.message === current.message &&
    loaded.lastOkAt === current.lastOkAt &&
    loaded.lastCount === current.lastCount
  ) {
    return;
  }
  current = loaded;
  emit();
}

export function subscribeCloudSyncStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCloudSyncStatus(patch: Partial<CloudSyncStatus>) {
  current = { ...current, ...patch };
  persist();
  emit();
}

export function formatSyncAgo(iso: string | null): string {
  if (!iso) return "Never synced";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hr ago";
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
