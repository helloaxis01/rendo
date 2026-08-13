import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RENDO iOS shell wraps the live Netlify web app.
 * Web feature updates ship via Netlify; run `npm run cap:sync` when
 * native plugins/config change, then rebuild in Xcode.
 */
const config: CapacitorConfig = {
  appId: "app.rendorecipes.rendo",
  appName: "RENDO",
  webDir: "public",
  server: {
    // Load the production web app so Cursor → Netlify updates appear
    // without rebuilding the native shell for every feature change.
    url: "https://rendorecipes.netlify.app",
    cleartext: false,
    // Keep Google/Apple OAuth inside the WebView. Without this, Capacitor
    // hands those hosts to Safari and the session never returns to the app.
    allowNavigation: [
      "rendorecipes.netlify.app",
      "*.supabase.co",
      "google.com",
      "*.google.com",
      "*.youtube.com",
      "*.googleusercontent.com",
      "*.gstatic.com",
      "*.googleapis.com",
      "appleid.apple.com",
    ],
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "RENDO",
    // WKWebView’s default UA is blocked by Google OAuth; look like Safari.
    appendUserAgent: "Version/18.4 Safari/604.1",
  },
  plugins: {
    StatusBar: {
      // LIGHT = dark clock on a light bar (app default). JS updates this with theme.
      style: "LIGHT",
      backgroundColor: "#F6F7F8",
      overlaysWebView: false,
    },
  },
};

export default config;
