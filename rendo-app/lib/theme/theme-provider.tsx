"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
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
      {children}
    </NextThemesProvider>
  );
}
