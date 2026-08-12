"use client";

import { Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  className?: string;
};

export function KeepAwakeBar({ enabled, onEnabledChange, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-y border-border-hairline bg-bg-primary px-4 py-3",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <Power className="h-4 w-4 text-text-primary" strokeWidth={2.25} />
        <p className="text-[12px] font-semibold tracking-[0.06em]">
          KEEP SCREEN AWAKE
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onEnabledChange}
        aria-label="Keep screen awake"
      />
    </div>
  );
}
