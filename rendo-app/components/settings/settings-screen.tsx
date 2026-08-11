"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { ChevronLeft, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { setPreferences } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

function subscribeNever() {
  return () => {};
}

export function SettingsScreen() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const isDark = (resolvedTheme ?? theme) === "dark";

  async function applyTheme(next: "light" | "dark") {
    setTheme(next);
    try {
      await setPreferences({ theme: next });
    } catch {
      // Dexie unavailable during SSR edge cases
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary">
      <header className="flex h-14 items-center gap-2 border-b border-border-hairline px-2">
        <Button type="button" variant="ghost" size="icon" asChild>
          <Link href="/" aria-label="Back">
            <ChevronLeft className="h-6 w-6" />
          </Link>
        </Button>
        <h1 className="font-display text-lg tracking-wide">SETTINGS</h1>
      </header>

      <div className="space-y-6 px-4 py-6">
        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Appearance
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void applyTheme("light")}
              className={cn(
                "flex min-h-20 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-colors",
                !isDark
                  ? "border-text-primary bg-bg-surface"
                  : "border-border-hairline bg-bg-surface"
              )}
            >
              <Sun className="h-5 w-5" />
              <span className="font-medium">Light</span>
            </button>
            <button
              type="button"
              onClick={() => void applyTheme("dark")}
              className={cn(
                "flex min-h-20 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-colors",
                isDark
                  ? "border-text-primary bg-bg-surface"
                  : "border-border-hairline bg-bg-surface"
              )}
            >
              <Moon className="h-5 w-5" />
              <span className="font-medium">Dark</span>
            </button>
          </div>
        </section>

        <div className="flex min-h-14 items-center justify-between border-b border-border-hairline py-3">
          <div>
            <p className="font-medium">Dark Mode</p>
            <p className="text-sm text-text-secondary">
              High-contrast black / white inversion
            </p>
          </div>
          {mounted ? (
            <Switch
              checked={isDark}
              onCheckedChange={(v) => void applyTheme(v ? "dark" : "light")}
              aria-label="Toggle dark mode"
            />
          ) : (
            <div className="h-7 w-12 rounded-full border border-border-hairline" />
          )}
        </div>
      </div>
    </div>
  );
}
