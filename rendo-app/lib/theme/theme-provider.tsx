"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { IncomingShareListener } from "@/components/native/incoming-share-listener";
import { SafeAreaClockBar } from "@/components/native/safe-area-clock-bar";
import { StatusBarTheme } from "@/components/native/status-bar-theme";

const STORAGE_KEY = "rendo-theme";

type ThemeName = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeName;
  resolvedTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => undefined,
});

function applyThemeClass(theme: ThemeName) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

function persistTheme(theme: ThemeName) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode
  }
  document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeProvider({
  children,
  initialTheme = "light",
}: {
  children: ReactNode;
  initialTheme?: ThemeName;
}) {
  const [theme, setThemeState] = useState<ThemeName>(initialTheme);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const next: ThemeName =
        stored === "dark" || stored === "light" ? stored : initialTheme;
      setThemeState(next);
      persistTheme(next);
      applyThemeClass(next);
    } catch {
      applyThemeClass(initialTheme);
    }
  }, [initialTheme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    persistTheme(next);
    applyThemeClass(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme: theme, setTheme }),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBarTheme />
      <SafeAreaClockBar />
      <IncomingShareListener />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
