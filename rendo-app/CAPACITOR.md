# RENDO + Capacitor (iOS)

Capacitor wraps the **live web app** so friends/family can install a real iOS app via Xcode / TestFlight, while https://rendorecipes.netlify.app stays unchanged.

## What this does

- Native iOS shell (`ios/`) loads `https://rendorecipes.netlify.app`
- Web feature updates from Cursor → GitHub → Netlify show up in the app **without** rebuilding native code
- Rebuild in Xcode when you change Capacitor plugins, icons, or native config

## First-time setup (your Mac)

Signing is already set to **Team VF9MHWH7NH** (`Apple Development: adamlorber1@mac.com`).

1. Open the project:

```bash
cd rendo-app
npm install
npm run cap:ios
```

2. In Xcode, pick an **iPhone** (or Simulator) and click **Run** ▶  
   First device install: unlock the phone and tap **Trust**.

3. Simulator-only (no Xcode UI):

```bash
cd rendo-app/ios/App
xcodebuild -scheme App -destination 'platform=iOS Simulator,name=iPhone 16' -configuration Debug build
```

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
