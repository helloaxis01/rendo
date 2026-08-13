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

## Google sign-in (native)

Keep this **Redirect URL** in Supabase → Authentication → URL Configuration:

- `https://rendorecipes.netlify.app/auth/callback`

Google sign-in must stay inside the app WebView. That requires a **native rebuild** after `allowNavigation` changes:

```bash
cd rendo-app
npm run cap:ios
```

Then Run on your iPhone. Do not test sign-in until that new Xcode build is installed — an older shell still dumps Google into Safari.

## Share sheet

After this native rebuild, two share paths work:

- **Out of RENDO:** the recipe share button opens the iOS share sheet (Reminders, Messages, etc.)
- **Into RENDO:** Safari / Instagram / Notes → Share → **RENDO** opens the app and extracts the recipe

Keep the existing capture sheet, overflow menu, camera, and photo library. Scan Cookbook uses the native camera plugin so the photo actually returns to RENDO after you snap it.

Rebuild in Xcode after `npm run cap:sync` so the Share Extension and Share plugin are installed.

## Notes

- Local recipes in the Capacitor WebView are separate from Safari’s IndexedDB until cloud backup syncs them.
- App ID: `app.rendorecipes.rendo`
- Config: `capacitor.config.ts`
