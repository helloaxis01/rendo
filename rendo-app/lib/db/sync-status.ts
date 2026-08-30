"use client";

export type CloudSyncState = "idle" | "syncing" | "ok" | "error";

export type CloudSyncStatus = {
  state: CloudSyncState;
  message: string;
  lastOkAt: string | null;
  lastCount: number | null;
};

const STORAGE_KEY_PREFIX = "rendo_cloud_sync_status_v1";
const listeners = new Set<() => void>();

const DEFAULT_STATUS: CloudSyncStatus = {
  state: "idle",
  message: "",
  lastOkAt: null,
  lastCount: null,
};

let current: CloudSyncStatus = DEFAULT_STATUS;
let didHydrate = false;
let activeUserId: string | null = null;

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}_${userId}`;
}

function load(userId: string | null): CloudSyncStatus {
  if (typeof window === "undefined" || !userId) {
    return DEFAULT_STATUS;
  }
  try {
    const raw = localStorage.getItem(storageKey(userId));
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
  if (typeof window === "undefined" || !activeUserId) return;
  try {
    localStorage.setItem(storageKey(activeUserId), JSON.stringify(current));
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
export function hydrateCloudSyncStatusFromStorage(userId?: string | null) {
  if (didHydrate && !userId) return;
  if (userId) {
    activeUserId = userId;
    current = load(userId);
    didHydrate = true;
    emit();
    return;
  }
  if (didHydrate || typeof window === "undefined") return;
  didHydrate = true;
}

export function hydrateCloudSyncStatusForUser(userId: string) {
  activeUserId = userId;
  current = load(userId);
  didHydrate = true;
  emit();
}

export function resetCloudSyncStatusForUser(userId: string) {
  activeUserId = userId;
  current = { ...DEFAULT_STATUS };
  persist();
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

export function clearCloudSyncUser() {
  activeUserId = null;
  current = { ...DEFAULT_STATUS };
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
