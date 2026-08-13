# Native scaffolds (pre-Capacitor)

Share Extension + Swift contracts kept here so Capacitor can own `../ios/`.

See `../CAPACITOR.md` for the Capacitor iOS shell.

## Share Extension (later)

When adding **Share → RENDO**:

1. Open `../ios/App/App.xcodeproj` in Xcode
2. Add a Share Extension target
3. Port `ShareExtension/ShareViewController.swift` + `Info.plist`
4. Point `RENDOIngestURL` at `https://rendorecipes.netlify.app/api/extract`
5. Prefer opening the app with a deep link (`rendo://capture?url=…` or `?text=…`) so shared recipes land in the vault

`ShareViewController` already chooses `type: "text"` when Instagram-style caption + URL are present.
