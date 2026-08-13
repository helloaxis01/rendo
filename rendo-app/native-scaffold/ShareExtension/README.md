# RENDO iOS Share Extension (scaffold)

Thin placeholder for the future Swift/Xcode (or Capacitor) app. Not a complete Xcode target.

## Status

**Wired in the Capacitor iOS shell** (`ios/App/ShareExtension/`). Rebuild the Xcode app to get **Share → RENDO**. This folder is the original scaffold only.

Until then, use **Paste Link** / **Paste Recipe Text** in the web Capture sheet.


## Wire-up steps (Xcode)

1. Create an App + Share Extension targets named `RENDO` / `RENDOShare`.
2. Add `ShareViewController.swift` and `Info.plist` to the Share Extension target.
3. Add `../Contracts/Recipe.swift` to the app target (SwiftData models later).
4. Set `RENDOIngestURL` in the extension Info.plist to your deployed `/api/extract` URL.
5. Enable App Groups if you later write shared URL payloads into a local queue before sync.
6. Activate share types: `public.url`, `public.plain-text` (Instagram often shares caption + URL as text).

## Current scaffold behavior

`ShareViewController` already posts to `/api/extract` with:
- `type: "text"` when Instagram-style caption + URL are both present
- `type: "url"` otherwise

Native Reminders hand-off and SwiftData local-first vault land in a later native / Capacitor port.

## Capacitor alternative

If staying web-first, a Capacitor iOS shell can register a share receiver plugin that opens RENDO with the shared URL/text as a deep link (`/capture?url=…` or `/capture?text=…`). Prefer the Share Extension when you want “Share → RENDO” without opening Safari first.
