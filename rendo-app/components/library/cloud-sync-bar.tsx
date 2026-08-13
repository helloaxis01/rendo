"use client";

import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatSyncAgo,
  getCloudSyncStatus,
  subscribeCloudSyncStatus,
  type CloudSyncStatus,
} from "@/lib/db/sync-status";
import { useAuth } from "@/lib/auth/auth-provider";
import { cn } from "@/lib/utils";

export function CloudSyncBar() {
  const { user, ready, configured } = useAuth();
  const [status, setStatus] = useState<CloudSyncStatus>(getCloudSyncStatus);
  const [, setTick] = useState(0);

  useEffect(() => subscribeCloudSyncStatus(() => setStatus(getCloudSyncStatus())), []);

  // Refresh relative time labels
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!ready || !configured || !user) return null;

  const ago = formatSyncAgo(status.lastOkAt);
  let label = "Automatic cloud backup on";
  let Icon = Cloud;
  let tone: "ok" | "busy" | "error" | "idle" = "idle";

  if (status.state === "syncing") {
    label = status.message || "Backing up…";
    Icon = LoaderCircle;
    tone = "busy";
  } else if (status.state === "error") {
    label = status.message || "Backup failed";
    Icon = CloudOff;
    tone = "error";
  } else if (status.state === "ok") {
    label =
      status.lastCount && status.lastCount > 0
        ? `Backed up · ${ago}`
        : `Up to date · ${ago}`;
    Icon = Cloud;
    tone = "ok";
  } else if (status.lastOkAt) {
    label = `Up to date · ${ago}`;
    tone = "ok";
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border-hairline px-4 py-2 text-[12px]",
        tone === "error"
          ? "bg-accent-alert/5 text-accent-alert"
          : "bg-bg-surface text-text-secondary"
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", tone === "busy" && "animate-spin")}
        strokeWidth={2}
        aria-hidden
      />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}
