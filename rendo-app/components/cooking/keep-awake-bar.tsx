"use client";

import { Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type Props = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
};

export function KeepAwakeBar({ enabled, onEnabledChange }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border-hairline bg-bg-primary/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
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
    </div>
  );
}
