# RENDO + Capacitor (iOS)

Capacitor wraps the **live web app** so friends/family can install a real iOS app via Xcode / TestFlight, while https://rendorecipes.netlify.app stays unchanged.

## What this does

- Native iOS shell (`ios/`) loads `https://rendorecipes.netlify.app`
- Web feature updates from Cursor → GitHub → Netlify show up in the app **without** rebuilding native code
- Rebuild in Xcode when you change Capacitor plugins, icons, or native config

## First-time setup (your Mac)

1. Install **Xcode** from the App Store and open it once (accept license).
2. In Terminal:

```bash
cd rendo-app
npm install
npm run cap:ios
```

3. In Xcode:
   - Select the **App** target → **Signing & Capabilities**
   - Choose your **Team** (Apple ID / Developer account)
   - Plug in your iPhone (or pick a Simulator)
   - Click **Run** ▶

## Day-to-day updates

| Change type | What to do |
|-------------|------------|
| Recipe UI, capture, backup, etc. | Push to GitHub → Netlify deploys → reopen the app |
| Capacitor config / plugins | `npm run cap:sync` then Run in Xcode |
| Open Xcode project | `npm run cap:open` |

## Share sheet (next step — not done yet)

System **Share → RENDO** needs a Share Extension / share plugin. Scaffold lives in `native-scaffold/ShareExtension/`. We’ll wire that after the shell is running on a device.

## Notes

- Local recipes in the Capacitor WebView are separate from Safari’s IndexedDB until cloud backup syncs them.
- App ID: `app.rendorecipes.rendo`
- Config: `capacitor.config.ts`
