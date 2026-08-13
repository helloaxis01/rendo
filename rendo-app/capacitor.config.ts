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
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "RENDO",
  },
  plugins: {
    StatusBar: {
      style: "DARK",
    },
  },
};

export default config;
