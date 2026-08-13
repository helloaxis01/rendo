"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { IncomingShareListener } from "@/components/native/incoming-share-listener";
import { SafeAreaClockBar } from "@/components/native/safe-area-clock-bar";
import { StatusBarTheme } from "@/components/native/status-bar-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="rendo-theme"
      disableTransitionOnChange
    >
      <StatusBarTheme />
      <SafeAreaClockBar />
      <IncomingShareListener />
      {children}
    </NextThemesProvider>
  );
}
