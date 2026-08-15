import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Syne, Inter } from "next/font/google";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RENDO",
  description: "A utility-first recipe extraction engine.",
  applicationName: "RENDO",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "RENDO",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F8" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1E1E" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeCookie = (await cookies()).get("rendo-theme")?.value;
  const theme = themeCookie === "dark" ? "dark" : "light";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full ${theme} ${syne.variable} ${inter.variable}`}
      style={{ colorScheme: theme }}
    >
      <body className="min-h-dvh bg-bg-primary font-sans text-text-primary antialiased">
        <ThemeProvider initialTheme={theme}>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
