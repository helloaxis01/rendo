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

let current: CloudSyncStatus = load();

function load(): CloudSyncStatus {
  if (typeof window === "undefined") {
    return { state: "idle", message: "", lastOkAt: null, lastCount: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: "idle", message: "", lastOkAt: null, lastCount: null };
    }
    const parsed = JSON.parse(raw) as CloudSyncStatus;
    return {
      state: parsed.state === "syncing" ? "idle" : parsed.state ?? "idle",
      message: parsed.message ?? "",
      lastOkAt: parsed.lastOkAt ?? null,
      lastCount: parsed.lastCount ?? null,
    };
  } catch {
    return { state: "idle", message: "", lastOkAt: null, lastCount: null };
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
