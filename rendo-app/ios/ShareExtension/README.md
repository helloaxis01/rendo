# RENDO iOS Share Extension (scaffold)

Thin placeholder for the future Swift/Xcode app. Not a complete Xcode target.

## Wire-up steps (Xcode)

1. Create an App + Share Extension targets named `RENDO` / `RENDOShare`.
2. Add `ShareViewController.swift` and `Info.plist` to the Share Extension target.
3. Add `../Contracts/Recipe.swift` to the app target (SwiftData models later).
4. Set `RENDOIngestURL` in the extension Info.plist to your deployed `/api/extract` URL.
5. Enable App Groups if you later write shared URL payloads into a local queue before sync.

## Phase 1 behavior

Posts `{ "type": "url", "payload": "<shared url>" }` to the RENDO extraction API. Native Reminders hand-off and SwiftData local-first vault land in a later native port.
